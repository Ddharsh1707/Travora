import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  IMPORT_FIELDS, MAX_ROWS, checkImportFile, detectMapping, isBlankRow, mapRows, missingRequired, cellToText,
  type CellValue, type ColumnMapping,
} from "../../lib/data/importParser";
import { cancelImport, commitImport, getImportBatch, getImportRows, listImportBatches, stageImport, type ImportBatch, type ImportRow } from "../../lib/data/imports";
import { Empty, ErrorNotice, Loading, PageHeader, Stat, StatusPill, formatDate, formatMoney } from "./common";

type Parsed = { name: string; kind: "csv" | "xlsx"; headers: string[]; rows: CellValue[][] };
type Step = "upload" | "map" | "preview" | "done";

async function parseFile(file: File, kind: "csv" | "xlsx"): Promise<{ headers: string[]; rows: CellValue[][] }> {
  let all: CellValue[][];
  if (kind === "xlsx") {
    const { default: readXlsxFile } = await import("read-excel-file");
    all = (await readXlsxFile(file)) as CellValue[][];
  } else {
    const Papa = (await import("papaparse")).default;
    const text = await file.text();
    const result = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
    all = result.data as CellValue[][];
  }
  const nonBlank = all.filter((r) => Array.isArray(r) && !isBlankRow(r));
  if (nonBlank.length < 2) throw new Error("The file needs a header row and at least one data row.");
  // Header = first row; make names unique so two "Date" columns stay separate.
  const seen = new Map<string, number>();
  const headers = nonBlank[0].map((h, i) => {
    const base = cellToText(h, 80) || `Column ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base} (${n})` : base;
  });
  const rows = nonBlank.slice(1);
  if (rows.length > MAX_ROWS) throw new Error(`The file has ${rows.length} rows. Import at most ${MAX_ROWS} at a time.`);
  return { headers, rows };
}

const ROW_TONE: Record<ImportRow["status"], string> = { valid: "approved", warning: "pending", error: "rejected", duplicate: "rejected", imported: "booked", skipped: "pending" };

/**
 * Upload → check file → detect columns → map → server validation preview →
 * confirm → import. Rows are only saved after the final confirmation.
 */
export default function ImportTravel() {
  const [step, setStep] = useState<Step>("upload");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [filter, setFilter] = useState<"all" | ImportRow["status"]>("all");
  const [includeWarnings, setIncludeWarnings] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<ImportBatch[]>([]);

  const loadHistory = () => listImportBatches().then(setHistory).catch(() => setHistory([]));
  useEffect(() => { void loadHistory(); }, []);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const check = checkImportFile(file.name, file.size, head);
    if (!check.ok) { setError(check.error); return; }
    setBusy(true);
    try {
      const { headers, rows } = await parseFile(file, check.kind);
      setParsed({ name: file.name, kind: check.kind, headers, rows });
      setMapping(detectMapping(headers));
      setStep("map");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the file.");
    } finally {
      setBusy(false);
    }
  }

  const missing = useMemo(() => missingRequired(mapping), [mapping]);
  const usedFields = useMemo(() => new Set(Object.values(mapping).filter(Boolean)), [mapping]);

  async function check() {
    if (!parsed) return;
    setBusy(true);
    setError("");
    try {
      const id = await stageImport(parsed.name, parsed.kind, mapping, mapRows(parsed.headers, parsed.rows, mapping));
      const [b, r] = await Promise.all([getImportBatch(id), getImportRows(id)]);
      setBatch(b);
      setRows(r);
      setFilter(b.error_rows + b.duplicate_rows > 0 ? "all" : "all");
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check the file.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!batch) return;
    const count = batch.valid_rows + (includeWarnings ? batch.warning_rows : 0);
    if (!window.confirm(`Import ${count} trip${count === 1 ? "" : "s"}? Rows with errors or duplicates will be skipped.`)) return;
    setBusy(true);
    try {
      const b = await commitImport(batch.id, includeWarnings);
      setBatch(b);
      setRows(await getImportRows(b.id));
      setStep("done");
      toast.success(`${b.imported_rows} trips imported`);
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
    setStep("upload"); setParsed(null); setMapping({}); setBatch(null); setRows([]); setError(""); setFilter("all");
  }

  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const importable = batch ? batch.valid_rows + (includeWarnings ? batch.warning_rows : 0) : 0;

  return (
    <div className="page-stack animate-page">
      <PageHeader eyebrow="TRAVEL DESK" title="Import travel from Excel / CSV" description="Upload a spreadsheet, match its columns, review every row, then confirm. Nothing is saved until you confirm." />

      <ol className="flex flex-wrap gap-2 text-xs" aria-label="Import steps">
        {(["upload", "map", "preview", "done"] as Step[]).map((s, i) => (
          <li key={s} className={`meta-chip ${step === s ? "meta-chip-primary" : ""}`}>{i + 1}. {{ upload: "Upload", map: "Match columns", preview: "Review", done: "Imported" }[s]}</li>
        ))}
      </ol>

      {error && <ErrorNotice message={error} />}

      {step === "upload" && (
        <label className="panel p-8 grid place-items-center text-center gap-3 cursor-pointer border-dashed" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void onFile(e.dataTransfer.files?.[0]); }}>
          {busy ? <Loading label="Reading file…" /> : (
            <>
              <FileSpreadsheet size={32} />
              <strong>Drop a .xlsx or .csv file here, or click to choose</strong>
              <span className="text-xs opacity-70">Up to 5 MB and {MAX_ROWS.toLocaleString("en-IN")} rows. First row must be the column names.</span>
              <span className="button button-primary"><Upload size={15} /> Choose file</span>
            </>
          )}
          <input type="file" className="sr-only" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      )}

      {step === "map" && parsed && (
        <div className="panel table-panel">
          <div className="table-toolbar flex-wrap">
            <div>
              <h2 className="section-heading">Match columns</h2>
              <p className="text-xs opacity-70">{parsed.name} · {parsed.rows.length} rows. We guessed the matches; change any that are wrong.</p>
            </div>
          </div>
          <div className="responsive-table">
            <table>
              <thead><tr><th>Column in your file</th><th>Example values</th><th>Save as</th></tr></thead>
              <tbody>
                {parsed.headers.map((h, i) => (
                  <tr key={h}>
                    <td className="font-semibold">{h}</td>
                    <td className="text-xs opacity-80 max-w-[280px] truncate">{parsed.rows.slice(0, 3).map((r) => cellToText(r[i], 40)).filter(Boolean).join(" · ") || "—"}</td>
                    <td>
                      <select aria-label={`Field for ${h}`} value={mapping[h] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value as ColumnMapping[string] }))}>
                        <option value="">Ignore this column</option>
                        {IMPORT_FIELDS.map((f) => (
                          <option key={f.key} value={f.key} disabled={usedFields.has(f.key) && mapping[h] !== f.key}>{f.label}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {missing.length > 0 && <p className="text-sm mt-3 flex items-center gap-2"><AlertTriangle size={15} className="text-amber-600" /> Still needed: {missing.join(", ")}</p>}
          <div className="dialog-actions">
            <button type="button" className="button button-ghost" onClick={reset}>Start over</button>
            <button type="button" className="button button-primary" disabled={busy || missing.length > 0} onClick={check}>{busy ? "Checking…" : "Check rows"}</button>
          </div>
        </div>
      )}

      {(step === "preview" || step === "done") && batch && (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
            <Stat label="Rows" value={String(batch.total_rows)} />
            <Stat label="Ready" value={String(batch.valid_rows)} />
            <Stat label="Warnings" value={String(batch.warning_rows)} detail="Imported if you allow" />
            <Stat label="Errors" value={String(batch.error_rows)} detail="Never imported" />
            <Stat label="Duplicates" value={String(batch.duplicate_rows)} detail="Already recorded" />
          </div>

          {step === "done" ? (
            <div className="panel p-4 flex items-center gap-3"><CheckCircle2 className="text-green-600" /> <span><strong>{batch.imported_rows} trips imported.</strong> Employee histories, search and totals are already updated.</span><button type="button" className="button button-ghost ml-auto" onClick={reset}>Import another file</button></div>
          ) : (
            <div className="panel p-4 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeWarnings} onChange={(e) => setIncludeWarnings(e.target.checked)} /> Also import rows with warnings</label>
              <span className="text-sm opacity-70">{importable} trip{importable === 1 ? "" : "s"} will be imported.</span>
              <div className="ml-auto flex gap-2">
                <button type="button" className="button button-ghost" onClick={cancel} disabled={busy}><XCircle size={14} /> Cancel import</button>
                <button type="button" className="button button-primary" onClick={confirm} disabled={busy || importable === 0}>{busy ? "Importing…" : "Confirm import"}</button>
              </div>
            </div>
          )}

          <div className="panel table-panel">
            <div className="table-toolbar">
              <h2 className="section-heading">Preview</h2>
              <div className="toolbar-filters">
                <select aria-label="Show rows" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
                  <option value="all">All rows</option>
                  <option value="valid">Ready</option>
                  <option value="warning">Warnings</option>
                  <option value="error">Errors</option>
                  <option value="duplicate">Duplicates</option>
                  {step === "done" && <option value="imported">Imported</option>}
                </select>
              </div>
            </div>
            {shown.length === 0 ? <Empty title="No rows here" description="Choose another filter." /> : (
              <div className="responsive-table">
                <table>
                  <thead><tr><th>Row</th><th>Employee</th><th>Date</th><th>From → To</th><th>Provider</th><th>PNR</th><th className="text-right">Amount</th><th>Status</th><th>Notes</th></tr></thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={r.id}>
                        <td>{r.row_number + 1}</td>
                        <td>{r.profile?.full_name ?? r.employee_name ?? "—"}<div className="table-subline">{r.profile?.employee_id ?? r.employee_code ?? ""}</div></td>
                        <td>{formatDate(r.departure_date)}</td>
                        <td>{r.origin ?? "—"} → {r.destination ?? "—"}</td>
                        <td>{r.provider ?? "—"}</td>
                        <td>{r.booking_reference ?? "—"}</td>
                        <td className="text-right">{formatMoney(r.amount, r.currency)}</td>
                        <td><span className={`approval-pill ${ROW_TONE[r.status]}`}>{r.status === "valid" ? "ready" : r.status}</span></td>
                        <td className="text-xs max-w-[260px]">{r.messages.map((m) => m.replace(/^Warning: /, "")).join("; ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <div className="panel table-panel">
        <div className="table-toolbar"><h2 className="section-heading">Recent imports</h2></div>
        {history.length === 0 ? <Empty title="No imports yet" description="Imported files will be listed here." /> : (
          <div className="responsive-table">
            <table>
              <thead><tr><th>File</th><th>When</th><th className="text-right">Rows</th><th className="text-right">Imported</th><th>Status</th></tr></thead>
              <tbody>
                {history.map((b) => (
                  <tr key={b.id}>
                    <td>{b.original_filename}</td>
                    <td>{formatDate(b.created_at)}</td>
                    <td className="text-right">{b.total_rows}</td>
                    <td className="text-right">{b.imported_rows}</td>
                    <td><StatusPill status={b.status} /></td>
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
