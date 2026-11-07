import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, ChevronDown, ChevronRight, FileSpreadsheet, FolderKanban, Layers, Upload, UserPlus, Users, XCircle } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { MAX_FILE_BYTES, MAX_ROWS, checkImportFile, type CellValue } from "../../lib/data/importParser";
import { analyzeWorkbook, sheetSummaryForDb, WB_FIELDS, type SheetInput, type WbField, type WorkbookSummary } from "../../lib/data/workbook";
import { readMerges } from "../../lib/data/xlsxMerges";
import {
  cancelImport, commitWorkbook, createProject, decideNames, getImportBatch, getNameReviews, getUploadProjects, getWorkbookRows, listImportBatches,
  listPeopleOptions, listProjects, setProjectAlias, stageWorkbook, storeImportFile,
  type ImportBatch, type NameReview, type PersonOption, type Project, type UploadProject, type WorkbookRow,
} from "../../lib/data/imports";
import { Empty, ErrorNotice, Loading, PageHeader, Stat, StatusPill, formatDate, formatMoney } from "./common";
import { DownloadOriginal } from "./UploadHistory";

type Step = "upload" | "sheets" | "lines" | "people" | "projects" | "done";
type Mappings = Record<string, Record<number, WbField | "">>;
type FileInfo = { name: string; kind: "csv" | "xlsx"; sheets: SheetInput[]; blob: File };

const STEPS: Array<{ key: Step; label: string }> = [
  { key: "upload", label: "Upload" },
  { key: "sheets", label: "Sheets & columns" },
  { key: "lines", label: "Check lines" },
  { key: "people", label: "People" },
  { key: "projects", label: "Projects" },
  { key: "done", label: "Imported" },
];

const KIND_LABEL: Record<string, string> = { flight: "Air tickets", train: "Train", bus: "Bus / train", cab: "Cab", hotel: "Hotel", visa: "Visa", forex: "Forex", other: "Other" };
const ROW_TONE: Record<WorkbookRow["status"], string> = { valid: "approved", warning: "pending-approval", error: "rejected", duplicate: "cancelled", imported: "booked", skipped: "completed" };
const ROW_LABEL: Record<WorkbookRow["status"], string> = { valid: "Ready", warning: "Check", error: "Error", duplicate: "Already imported", imported: "Imported", skipped: "Skipped" };

async function readFile(file: File, kind: "csv" | "xlsx"): Promise<SheetInput[]> {
  if (kind === "csv") {
    const Papa = (await import("papaparse")).default;
    const result = Papa.parse<string[]>(await file.text(), { skipEmptyLines: false });
    return [{ name: file.name.replace(/\.csv$/i, ""), rows: result.data as CellValue[][], merges: [] }];
  }
  const { default: readXlsxFile, readSheetNames } = await import("read-excel-file");
  const merges = readMerges(new Uint8Array(await file.arrayBuffer()));
  const names = await readSheetNames(file);
  if (names.length > 40) throw new Error("The workbook has more than 40 sheets. Split it into smaller files.");
  const sheets: SheetInput[] = [];
  for (const name of names) {
    const rows = (await readXlsxFile(file, { sheet: name })) as CellValue[][];
    sheets.push({ name, rows, merges: merges[name] ?? [] });
  }
  return sheets;
}

function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}

export default function ImportTravel() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<FileInfo | null>(null);
  const [mappings, setMappings] = useState<Mappings>({});
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [createMissing, setCreateMissing] = useState(true);
  const [currency, setCurrency] = useState("INR");
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [rows, setRows] = useState<WorkbookRow[]>([]);
  const [reviews, setReviews] = useState<NameReview[]>([]);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [uploadProjects, setUploadProjects] = useState<UploadProject[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState<{ status: string; sheet: string }>({ status: "all", sheet: "all" });
  const [includeWarnings, setIncludeWarnings] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<ImportBatch[]>([]);

  const loadHistory = () => listImportBatches().then(setHistory).catch(() => setHistory([]));
  useEffect(() => { void loadHistory(); }, []);

  const summary: WorkbookSummary | null = useMemo(() => (file ? analyzeWorkbook(file.sheets, mappings) : null), [file, mappings]);
  const includedLines = useMemo(() => (summary ? summary.lines.filter((l) => !excluded[l.sheet]) : []), [summary, excluded]);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setError("");
    const head = new Uint8Array(await f.slice(0, 8).arrayBuffer());
    const check = checkImportFile(f.name, f.size, head);
    if (!check.ok) { setError(check.error); return; }
    setBusy(true);
    try {
      const sheets = await readFile(f, check.kind);
      setFile({ name: f.name, kind: check.kind, sheets, blob: f });
      setMappings({});
      setExcluded({});
      const firstData = analyzeWorkbook(sheets).sheets.find((s) => s.status === "data");
      setOpen(firstData ? { [firstData.name]: true } : {});
      setStep("sheets");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the file.");
    } finally {
      setBusy(false);
    }
  }

  async function stage() {
    if (!file || !summary) return;
    if (includedLines.length === 0) { setError("No booking lines to check. Include at least one sheet with bookings."); return; }
    if (includedLines.length > MAX_ROWS) { setError(`The file has ${includedLines.length} booking lines. Upload at most ${MAX_ROWS} at a time.`); return; }
    setBusy(true);
    setError("");
    try {
      const sheets = sheetSummaryForDb(summary, mappings).map((s) => ({ ...s, included: !excluded[s.name] }));
      const id = await stageWorkbook(file.name, file.kind, sheets, includedLines, createMissing, currency);
      // Keep the exact file so it can be downloaded from the upload history.
      await storeImportFile(id, file.blob, file.kind).catch((err) =>
        toast.error(err instanceof Error ? err.message : "The original file could not be stored."));
      const [b, r] = await Promise.all([getImportBatch(id), getWorkbookRows(id)]);
      setBatch(b);
      setRows(r);
      setFilter({ status: "all", sheet: "all" });
      setStep("lines");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check the file.");
    } finally {
      setBusy(false);
    }
  }

  async function goPeople() {
    if (!batch) return;
    setBusy(true);
    setError("");
    try {
      const [rv, ppl] = await Promise.all([getNameReviews(batch.id), listPeopleOptions()]);
      setReviews(rv);
      setPeople(ppl);
      setStep("people");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the people to review.");
    } finally {
      setBusy(false);
    }
  }

  async function savePeople() {
    if (!batch) return;
    setBusy(true);
    setError("");
    try {
      await decideNames(batch.id, reviews.map((r) => ({ name_key: r.name_key, decision: r.decision, profile_id: r.decision === "link" ? r.profile_id : null })));
      const [up, pj] = await Promise.all([getUploadProjects(batch.id), listProjects()]);
      setUploadProjects(up);
      setProjects(pj);
      setStep("projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the people decisions.");
    } finally {
      setBusy(false);
    }
  }

  async function mapProject(p: UploadProject, value: string) {
    setBusy(true);
    setError("");
    try {
      let projectId: string | null = null;
      if (value.startsWith("new:")) {
        projectId = await createProject(p.label.trim(), value.slice(4) as Project["kind"]);
      } else if (value) {
        projectId = value;
      }
      const updated = await setProjectAlias(p.label, projectId);
      const [up, pj] = await Promise.all([getUploadProjects(batch!.id), listProjects()]);
      setUploadProjects(up);
      setProjects(pj);
      if (updated > 0) toast.success(`${updated} earlier trip${updated === 1 ? "" : "s"} with "${p.label}" updated too`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the project mapping.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!batch) return;
    const count = batch.valid_rows + (includeWarnings ? batch.warning_rows : 0);
    if (!window.confirm(`Import up to ${count} booking line${count === 1 ? "" : "s"}? Errors, duplicates and skipped people are left out.`)) return;
    setBusy(true);
    try {
      const b = await commitWorkbook(batch.id, includeWarnings);
      setBatch(b);
      setRows(await getWorkbookRows(b.id));
      setStep("done");
      toast.success(`${b.imported_rows} booking lines imported${b.created_employees ? `, ${b.created_employees} new employees added` : ""}`);
      void loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import the rows.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (batch && batch.status === "staged") await cancelImport(batch.id).catch(() => undefined);
    reset();
    void loadHistory();
  }

  function reset() {
    setStep("upload"); setFile(null); setMappings({}); setExcluded({}); setBatch(null); setRows([]); setReviews([]); setUploadProjects([]); setError("");
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="page-stack animate-page">
      <PageHeader
        eyebrow="TRAVEL DESK"
        title="Upload company travel data"
        description="Upload the travel desk workbook as it is: every sheet is read (air, hotel, bus and train, cab, visa, forex). You check what was found, confirm who each traveller is, map project names once, then import. Nothing is saved until the last step."
      />

      <ol className="flex flex-wrap gap-2 text-xs" aria-label="Upload steps">
        {STEPS.map((s, i) => (
          <li key={s.key} className={`meta-chip ${step === s.key ? "meta-chip-primary" : ""}`} aria-current={step === s.key ? "step" : undefined} style={{ opacity: i > stepIndex ? 0.55 : 1 }}>{i + 1}. {s.label}</li>
        ))}
      </ol>

      {error && <ErrorNotice message={error} />}

      {step === "upload" && (
        <>
          <div className="panel p-4 grid gap-3 md:grid-cols-2 text-sm">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-1" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} />
              <span><strong className="inline-flex items-center gap-1"><UserPlus size={14} /> Suggest adding travellers who are not employees yet</strong>
                <span className="block text-xs opacity-70 mt-0.5">You still confirm every person on the People step. New people get an ID like NEW-1A2B3C4D and no login.</span>
              </span>
            </label>
            <label className="flex items-start gap-3">
              <span className="flex-1"><strong>Currency when the sheet has none</strong>
                <span className="block text-xs opacity-70 mt-0.5">Saved with the upload and shown in reports. A currency column in the sheet always wins.</span>
              </span>
              <select aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {["INR", "USD", "EUR", "GBP", "AED", "LRD", "MUR", "KES", "UGX"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <label className="panel p-8 grid place-items-center text-center gap-3 cursor-pointer border-dashed" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void onFile(e.dataTransfer.files?.[0]); }}>
            {busy ? <Loading label="Reading every sheet…" /> : (
              <>
                <FileSpreadsheet size={32} />
                <strong>Drop the travel workbook (.xlsx) or a .csv here, or click to choose</strong>
                <span className="text-xs opacity-70 max-w-xl">Up to {Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB and {MAX_ROWS.toLocaleString("en-IN")} booking lines. Title rows above the headings, merged cells, several sheets and blank template sheets are fine.</span>
                <span className="button button-primary"><Upload size={15} /> Choose file</span>
              </>
            )}
            <input type="file" className="sr-only" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </>
      )}

      {step === "sheets" && file && summary && (
        <SheetsStep
          file={file} summary={summary} mappings={mappings} setMappings={setMappings} excluded={excluded} setExcluded={setExcluded}
          open={open} setOpen={setOpen} includedLines={includedLines.length} currency={currency} busy={busy} onBack={reset} onNext={stage}
        />
      )}

      {step === "lines" && batch && (
        <LinesStep batch={batch} rows={rows} filter={filter} setFilter={setFilter} busy={busy} onCancel={cancel} onNext={goPeople} />
      )}

      {step === "people" && batch && (
        <PeopleStep reviews={reviews} setReviews={setReviews} people={people} busy={busy} onCancel={cancel} onNext={savePeople} />
      )}

      {step === "projects" && batch && (
        <ProjectsStep
          batch={batch} uploadProjects={uploadProjects} projects={projects} busy={busy} includeWarnings={includeWarnings}
          setIncludeWarnings={setIncludeWarnings} onMap={mapProject} onBack={() => setStep("people")} onCancel={cancel} onConfirm={confirm}
        />
      )}

      {step === "done" && batch && (
        <>
          <div className="panel p-4 flex flex-wrap items-center gap-3"><CheckCircle2 className="text-green-600" />
            <span><strong>{batch.imported_rows} booking lines imported{batch.created_employees ? `, ${batch.created_employees} new employee${batch.created_employees === 1 ? "" : "s"} added` : ""}.</strong> Employee histories, search and totals are updated.</span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Link href={`/travel/uploads/${batch.id}`} className="button button-primary"><BarChart3 size={14} /> View upload report</Link>
              <button type="button" className="button button-ghost" onClick={reset}>Upload another file</button>
            </div>
          </div>
          <LinesTable rows={rows} filter={filter} setFilter={setFilter} done />
        </>
      )}

      <div className="panel table-panel">
        <div className="table-toolbar"><h2 className="section-heading">Recent uploads</h2><Link href="/travel/uploads" className="table-action ml-auto">Full upload history</Link></div>
        {history.length === 0 ? <Empty title="No uploads yet" description="Uploaded files and their reports will be listed here." /> : (
          <div className="responsive-table">
            <table>
              <thead><tr><th>File</th><th>When</th><th className="text-right">Lines</th><th className="text-right">Imported</th><th>Status</th><th><span className="sr-only">Report</span></th></tr></thead>
              <tbody>
                {history.map((b) => (
                  <tr key={b.id}>
                    <td>{b.original_filename}{b.format_version === 2 && <div className="table-subline">{(b.sheets as unknown[] | undefined)?.length ?? 0} sheets · {b.assumed_currency ?? "INR"} assumed</div>}</td>
                    <td>{formatDate(b.created_at)}</td>
                    <td className="text-right">{b.total_rows}</td>
                    <td className="text-right">{b.imported_rows}</td>
                    <td><StatusPill status={b.status} /></td>
                    <td className="whitespace-nowrap"><div className="flex flex-wrap items-center gap-3">
                      {b.status === "committed" && b.imported_rows > 0 ? <Link href={`/travel/uploads/${b.id}`} className="table-action inline-flex items-center gap-1"><BarChart3 size={13} /> Report</Link> : null}
                      <DownloadOriginal path={b.file_path} filename={b.original_filename} compact />
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: what was found in each sheet, and how its columns are read
// ---------------------------------------------------------------------------
function SheetsStep(props: {
  file: FileInfo; summary: WorkbookSummary; mappings: Mappings; setMappings: (fn: (m: Mappings) => Mappings) => void;
  excluded: Record<string, boolean>; setExcluded: (fn: (m: Record<string, boolean>) => Record<string, boolean>) => void;
  open: Record<string, boolean>; setOpen: (fn: (m: Record<string, boolean>) => Record<string, boolean>) => void;
  includedLines: number; currency: string; busy: boolean; onBack: () => void; onNext: () => void;
}) {
  const { file, summary, mappings, setMappings, excluded, setExcluded, open, setOpen, includedLines, currency, busy, onBack, onNext } = props;
  const dataSheets = summary.sheets.filter((s) => s.status === "data");
  const recorded = dataSheets.filter((s) => !excluded[s.name]).reduce((n, s) => n + (summary.perSheet[s.name]?.total ?? 0), 0);
  const withoutCost = dataSheets.filter((s) => !excluded[s.name]).reduce((n, s) => n + (summary.perSheet[s.name]?.withoutCost ?? 0), 0);

  return (
    <>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="Sheets in file" value={String(summary.sheets.length)} detail={`${dataSheets.length} with bookings`} />
        <Stat label="Booking lines" value={includedLines.toLocaleString("en-IN")} detail="From the sheets you include" />
        <Stat label={`Recorded cost (${currency})`} value={formatMoney(recorded, currency)} detail="Sum of cost cells, before any checks" />
        <Stat label="Lines without a cost" value={String(withoutCost)} detail="Shown as missing, never as zero" />
      </div>

      <div className="panel table-panel">
        <div className="table-toolbar flex-wrap">
          <div>
            <h2 className="section-heading inline-flex items-center gap-2"><Layers size={16} /> Sheets in {file.name}</h2>
            <p className="text-xs opacity-70">Open a sheet to see how each column is read. Columns that are not used are still kept with every record.</p>
          </div>
        </div>
        <div className="grid gap-2">
          {summary.sheets.map((s) => {
            const per = summary.perSheet[s.name];
            const isOpen = !!open[s.name];
            const canOpen = s.status === "data" || s.status === "empty";
            return (
              <div key={s.name} className="border rounded-none" style={{ borderColor: "var(--line)" }}>
                <div className="flex flex-wrap items-center gap-3 p-3">
                  <button type="button" className="inline-flex items-center gap-2 font-semibold text-left" onClick={() => canOpen && setOpen((o) => ({ ...o, [s.name]: !o[s.name] }))} aria-expanded={isOpen} disabled={!canOpen}>
                    {canOpen ? (isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />) : <span style={{ width: 15 }} />}
                    {s.name}
                  </button>
                  <Badge tone={s.status === "data" ? "booked" : s.status === "no_header" ? "pending-approval" : "completed"}>{s.status === "data" ? KIND_LABEL[s.kind] : s.status === "no_header" ? "Not read" : s.status === "empty" ? "Empty template" : "Blank"}</Badge>
                  {s.status === "data" && <span className="text-xs opacity-80">Headings on row {s.headerRow} · {per?.lines ?? 0} lines · {formatMoney(per?.total ?? 0, currency)} recorded{per?.shared ? ` · ${per.shared} share a cost` : ""}{per?.withoutCost ? ` · ${per.withoutCost} without cost` : ""}</span>}
                  {s.reason && <span className="text-xs opacity-80">{s.reason}</span>}
                  {s.status === "data" && (
                    <label className="ml-auto text-xs flex items-center gap-2"><input type="checkbox" checked={!excluded[s.name]} onChange={(e) => setExcluded((x) => ({ ...x, [s.name]: !e.target.checked }))} /> Include</label>
                  )}
                </div>
                {(s.skipped.length > 0 || (per?.skippedRows.length ?? 0) > 0) && (
                  <ul className="px-3 pb-3 text-xs grid gap-1">
                    {s.skipped.map((b, i) => <li key={i} className="flex gap-2"><AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" /> <span>{b.reason}{b.preview ? ` — starts “${b.preview}”` : ""}</span></li>)}
                    {per?.skippedRows.map((r) => <li key={`r${r.row}`} className="flex gap-2"><AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" /> <span>Row {r.row} not read: {r.reason}</span></li>)}
                  </ul>
                )}
                {isOpen && (
                  <div className="responsive-table border-t" style={{ borderColor: "var(--line)" }}>
                    <table>
                      <thead><tr><th>Column</th><th>Heading in the sheet</th><th>Example</th><th className="text-right">Filled</th><th>Read as</th></tr></thead>
                      <tbody>
                        {s.columns.map((c) => {
                          const value = mappings[s.name]?.[c.index] ?? c.field;
                          return (
                            <tr key={c.index}>
                              <td>{c.letter}</td>
                              <td className="font-semibold">{c.header}</td>
                              <td className="text-xs opacity-80 max-w-[260px] truncate" title={c.sample}>{c.sample || "—"}</td>
                              <td className="text-right">{c.filled}</td>
                              <td>
                                <select aria-label={`Read ${c.header} as`} value={value} onChange={(e) => setMappings((m) => ({ ...m, [s.name]: { ...(m[s.name] ?? {}), [c.index]: e.target.value as WbField | "" } }))}>
                                  <option value="">Keep as extra detail only</option>
                                  {WB_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                                </select>
                                {!value && <div className="table-subline">Not used in reports; saved with the record</div>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="dialog-actions">
          <button type="button" className="button button-ghost" onClick={onBack}>Choose another file</button>
          <button type="button" className="button button-primary" disabled={busy || includedLines === 0} onClick={onNext}>{busy ? "Checking…" : `Check ${includedLines} lines`}</button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Step 3: the database's check of every line
// ---------------------------------------------------------------------------
function LinesStep({ batch, rows, filter, setFilter, busy, onCancel, onNext }: {
  batch: ImportBatch; rows: WorkbookRow[]; filter: { status: string; sheet: string }; setFilter: (f: { status: string; sheet: string }) => void;
  busy: boolean; onCancel: () => void; onNext: () => void;
}) {
  const addons = rows.filter((r) => r.line_type === "addon" || r.line_type === "reissue").length;
  const shared = rows.filter((r) => r.amount_state === "included_in_group").length;
  const missingCost = rows.filter((r) => r.amount_state === "missing" && r.status !== "error").length;
  const flagged = rows.filter((r) => r.record_status).length;
  return (
    <>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Stat label="Lines checked" value={String(batch.total_rows)} />
        <Stat label="Ready" value={String(batch.valid_rows)} />
        <Stat label="To check" value={String(batch.warning_rows)} detail="Imported if you allow" />
        <Stat label="Errors" value={String(batch.error_rows)} detail="Never imported" />
        <Stat label="Already imported" value={String(batch.duplicate_rows)} detail="From an earlier upload" />
      </div>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="Extra charges" value={String(addons)} detail="Add-ons and reissues, kept as their own cost lines" />
        <Stat label="Shared cost" value={String(shared)} detail="Covered by one cost on another row" />
        <Stat label="Cost missing" value={String(missingCost)} detail="Blank cost cells" />
        <Stat label="Cancelled / no-show / reissued" value={String(flagged)} detail="From words typed in the sheet" />
      </div>
      <div className="panel p-4 flex flex-wrap items-center gap-3">
        <span className="text-sm">Next, confirm who each traveller is. Nothing has been saved yet.</span>
        <div className="ml-auto flex gap-2">
          <button type="button" className="button button-ghost" onClick={onCancel} disabled={busy}><XCircle size={14} /> Cancel upload</button>
          <button type="button" className="button button-primary" onClick={onNext} disabled={busy}><Users size={14} /> {busy ? "Loading…" : "Review people"}</button>
        </div>
      </div>
      <LinesTable rows={rows} filter={filter} setFilter={setFilter} />
    </>
  );
}

function LinesTable({ rows, filter, setFilter, done = false }: { rows: WorkbookRow[]; filter: { status: string; sheet: string }; setFilter: (f: { status: string; sheet: string }) => void; done?: boolean }) {
  const sheets = useMemo(() => Array.from(new Set(rows.map((r) => r.sheet_name ?? ""))).filter(Boolean), [rows]);
  const shown = rows.filter((r) => (filter.status === "all" || r.status === filter.status) && (filter.sheet === "all" || r.sheet_name === filter.sheet));
  return (
    <div className="panel table-panel">
      <div className="table-toolbar">
        <h2 className="section-heading">Every line</h2>
        <div className="toolbar-filters">
          <select aria-label="Sheet" value={filter.sheet} onChange={(e) => setFilter({ ...filter, sheet: e.target.value })}>
            <option value="all">All sheets</option>
            {sheets.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select aria-label="Status" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
            <option value="all">All lines</option>
            <option value="valid">Ready</option>
            <option value="warning">To check</option>
            <option value="error">Errors</option>
            <option value="duplicate">Already imported</option>
            {done && <option value="imported">Imported</option>}
            {done && <option value="skipped">Skipped</option>}
          </select>
        </div>
      </div>
      {shown.length === 0 ? <Empty title="No lines here" description="Choose another filter." /> : (
        <div className="responsive-table">
          <table>
            <thead><tr><th>Sheet · row</th><th>Traveller</th><th>Date</th><th>Where</th><th>Project</th><th>PNR / ref</th><th className="text-right">Cost</th><th>Status</th><th>Notes</th></tr></thead>
            <tbody>
              {shown.slice(0, 1000).map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{r.sheet_name ?? "—"} · {r.source_row ?? r.row_number}</td>
                  <td>{r.profile?.full_name ?? r.details?.display_name ?? r.employee_name ?? "—"}<div className="table-subline">{r.profile?.employee_id ?? r.employee_code ?? (r.profile ? "" : "to confirm")}</div></td>
                  <td className="whitespace-nowrap">{formatDate(r.departure_date)}</td>
                  <td>{r.origin ? `${r.origin} → ${r.destination ?? "—"}` : r.destination ?? "—"}<div className="table-subline">{r.provider ?? ""}</div></td>
                  <td>{r.project_raw ?? <span className="opacity-60">none in sheet</span>}</td>
                  <td>{r.booking_reference ?? "—"}</td>
                  <td className="text-right whitespace-nowrap">
                    {r.amount_state === "included_in_group" ? <span className="text-xs">shared</span> : r.amount_state === "missing" ? <span className="text-xs opacity-70">missing</span> : formatMoney(r.amount, r.currency)}
                    {r.line_type && r.line_type !== "fare" && r.line_type !== "hotel" && r.line_type !== "cab" && <div className="table-subline">{r.line_type}</div>}
                  </td>
                  <td><Badge tone={ROW_TONE[r.status]}>{ROW_LABEL[r.status]}</Badge>{r.record_status && <div className="table-subline">{r.record_status.replace("_", " ")}</div>}</td>
                  <td className="text-xs max-w-[300px]">{r.messages.map((m) => m.replace(/^Warning: /, "")).join("; ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length > 1000 && <p className="text-xs opacity-70 p-3">Showing the first 1,000 of {shown.length} lines.</p>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: who is each traveller?
// ---------------------------------------------------------------------------
function PeopleStep({ reviews, setReviews, people, busy, onCancel, onNext }: {
  reviews: NameReview[]; setReviews: (fn: (r: NameReview[]) => NameReview[]) => void; people: PersonOption[]; busy: boolean; onCancel: () => void; onNext: () => void;
}) {
  const pending = reviews.filter((r) => r.decision === "pending" || (r.decision === "link" && !r.profile_id)).length;
  const counts = { link: reviews.filter((r) => r.decision === "link").length, create: reviews.filter((r) => r.decision === "create").length, skip: reviews.filter((r) => r.decision === "skip").length };
  const set = (key: string, patch: Partial<NameReview>) => setReviews((rs) => rs.map((r) => (r.name_key === key ? { ...r, ...patch } : r)));
  return (
    <div className="panel table-panel">
      <div className="table-toolbar flex-wrap">
        <div>
          <h2 className="section-heading inline-flex items-center gap-2"><Users size={16} /> Who is each traveller?</h2>
          <p className="text-xs opacity-70">The sheet has no employee IDs for these names. Spellings with exactly the same words (for example “KETA/RAJU MR” and “MR. RAJU KETA”) are grouped; nothing else is merged. Link each to an employee, add them as new, or leave their lines out.</p>
        </div>
        <span className="text-xs">{counts.link} linked · {counts.create} new · {counts.skip} left out{pending ? ` · ${pending} to decide` : ""}</span>
      </div>
      {reviews.length === 0 ? <Empty title="Everyone was matched by employee ID" description="Nothing to review here." /> : (
        <div className="responsive-table">
          <table>
            <thead><tr><th>Name in the sheet</th><th className="text-right">Lines</th><th>Suggestion</th><th>Decision</th></tr></thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.name_key}>
                  <td className="font-semibold">{r.display_name}<div className="table-subline">{r.raw_names.join(" · ")}{r.employee_code ? ` · ID ${r.employee_code}` : ""}</div></td>
                  <td className="text-right">{r.row_count}</td>
                  <td className="text-xs">{r.suggested ? <>Same name as <strong>{r.suggested.full_name}</strong> ({r.suggested.employee_id})</> : "No employee with this name"}</td>
                  <td>
                    <div className="flex flex-wrap gap-2 items-center">
                      <select aria-label={`Decision for ${r.display_name}`} value={r.decision} onChange={(e) => set(r.name_key, { decision: e.target.value as NameReview["decision"], profile_id: e.target.value === "link" ? (r.profile_id ?? r.suggested_profile_id) : null })}>
                        <option value="pending">Decide…</option>
                        <option value="link">Link to an employee</option>
                        <option value="create">Add as a new person</option>
                        <option value="skip">Leave these lines out</option>
                      </select>
                      {r.decision === "link" && (
                        <select aria-label={`Employee for ${r.display_name}`} value={r.profile_id ?? ""} onChange={(e) => set(r.name_key, { profile_id: e.target.value || null })}>
                          <option value="">Choose employee…</option>
                          {people.map((p) => <option key={p.id} value={p.id}>{p.full_name} · {p.employee_id}{p.department ? ` · ${p.department}` : ""}</option>)}
                        </select>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pending > 0 && <p className="text-sm mt-3 flex items-center gap-2"><AlertTriangle size={15} className="text-amber-600" /> {pending} {pending === 1 ? "person still needs" : "people still need"} a decision. Undecided people’s lines are left out.</p>}
      <div className="dialog-actions">
        <button type="button" className="button button-ghost" onClick={onCancel} disabled={busy}><XCircle size={14} /> Cancel upload</button>
        <button type="button" className="button button-primary" onClick={onNext} disabled={busy}><FolderKanban size={14} /> {busy ? "Saving…" : "Save and map projects"}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5: project names → projects, then import
// ---------------------------------------------------------------------------
function ProjectsStep({ batch, uploadProjects, projects, busy, includeWarnings, setIncludeWarnings, onMap, onBack, onCancel, onConfirm }: {
  batch: ImportBatch; uploadProjects: UploadProject[]; projects: Project[]; busy: boolean; includeWarnings: boolean; setIncludeWarnings: (v: boolean) => void;
  onMap: (p: UploadProject, value: string) => void; onBack: () => void; onCancel: () => void; onConfirm: () => void;
}) {
  const importable = batch.valid_rows + (includeWarnings ? batch.warning_rows : 0);
  const kindLabel: Record<string, string> = { project: "Project", cost_centre: "Cost centre", event: "Event", other: "Other" };
  return (
    <>
      <div className="panel table-panel">
        <div className="table-toolbar flex-wrap">
          <div>
            <h2 className="section-heading inline-flex items-center gap-2"><FolderKanban size={16} /> Project names in this upload</h2>
            <p className="text-xs opacity-70">Map each spelling once; later uploads reuse it, and earlier trips with the same spelling follow. Mark names such as a head office or an annual event as a cost centre or event so project rankings stay about site work. Unmapped names are kept on the trip as written and shown as “unassigned”.</p>
          </div>
        </div>
        {uploadProjects.length === 0 ? <Empty title="No project names" description="This upload has no project column, or it is empty." /> : (
          <div className="responsive-table">
            <table>
              <thead><tr><th>Name in the sheet</th><th className="text-right">Lines</th><th className="text-right">Recorded cost</th><th>Mapped to</th></tr></thead>
              <tbody>
                {uploadProjects.map((p) => (
                  <tr key={p.alias_key}>
                    <td className="font-semibold">{p.label}</td>
                    <td className="text-right">{p.rows}</td>
                    <td className="text-right">{formatMoney(p.amount, batch.assumed_currency ?? "INR")}</td>
                    <td>
                      <select aria-label={`Project for ${p.label}`} disabled={busy} value={p.project_id ?? ""} onChange={(e) => onMap(p, e.target.value)}>
                        <option value="">Unassigned</option>
                        <optgroup label={`Create “${p.label.trim()}” as`}>
                          <option value="new:project">New project</option>
                          <option value="new:cost_centre">New cost centre</option>
                          <option value="new:event">New event</option>
                        </optgroup>
                        {projects.length > 0 && (
                          <optgroup label="Existing">
                            {projects.map((x) => <option key={x.id} value={x.id}>{x.name} · {kindLabel[x.kind] ?? x.kind}</option>)}
                          </optgroup>
                        )}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="panel p-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeWarnings} onChange={(e) => setIncludeWarnings(e.target.checked)} /> Also import lines marked “to check”</label>
        <span className="text-sm opacity-70">Up to {importable} line{importable === 1 ? "" : "s"}; people you left out are skipped.</span>
        <div className="ml-auto flex gap-2">
          <button type="button" className="button button-ghost" onClick={onBack} disabled={busy}>Back to people</button>
          <button type="button" className="button button-ghost" onClick={onCancel} disabled={busy}><XCircle size={14} /> Cancel upload</button>
          <button type="button" className="button button-primary" onClick={onConfirm} disabled={busy || importable === 0}>{busy ? "Importing…" : "Import"}</button>
        </div>
      </div>
    </>
  );
}

