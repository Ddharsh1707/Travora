import { useEffect, useRef, useState } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, FileSpreadsheet, FileText, Image as ImageIcon, Loader2, ScanLine, Sparkles, Upload, UserPlus, XCircle } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { readUploadFile } from "../../lib/data/readUploadFile";
import { NEW_PEOPLE_LABELS, NoBookingsFound, autoImportSheets, autoTicket, fileTicket, planReady, readPdfSheets, routeFor, saveGroupTicket, type AutoOptions, type FileRoute, type FiledTicket, type GroupResult, type NewPeopleMode, type PassengerPlan } from "../../lib/data/autoUpload";
import { WORKFORCE_TYPE_LABELS } from "../../lib/data/imports";
import { listPeopleOptions, type PersonOption } from "../../lib/data/imports";
import type { Extraction } from "../../lib/data/documents";
import { formatDate, formatMoney } from "./common";

type Item = {
  id: string;
  file: File;
  route: FileRoute | null;
  state: "waiting" | "working" | "done" | "review" | "who" | "group" | "error";
  stage: string;
  title?: string;
  lines?: string[];
  notes?: string[];
  reportId?: string;
  extraction?: Extraction;
  /** A ticket with several passengers: who each one is (or "leave out"). */
  group?: Array<PassengerPlan & { leaveOut?: boolean }>;
};

const ACCEPT = ".xlsx,.csv,.pdf,.png,.jpg,.jpeg,.webp,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/pdf,image/png,image/jpeg,image/webp";

function FileIcon({ item }: { item: Item }) {
  if (item.state === "working" || item.state === "waiting") return <Loader2 size={18} className={item.state === "working" ? "animate-spin" : "opacity-40"} />;
  if (item.state === "done") return <CheckCircle2 size={18} className="text-green-600" />;
  if (item.state === "error") return <XCircle size={18} className="text-red-600" />;
  if (item.state === "who" || item.state === "review" || item.state === "group") return <AlertTriangle size={18} className="text-amber-600" />;
  return item.route === "ticket" ? <ImageIcon size={18} /> : item.route === "pdf" ? <FileText size={18} /> : <FileSpreadsheet size={18} />;
}

function tripLine(ex: Extraction): string {
  const f = ex.fields;
  const where = f.origin || f.destination ? `${f.origin ?? "?"} → ${f.destination ?? "?"}` : "No route read";
  return [where, f.departure_date ? formatDate(f.departure_date) : null, f.provider, f.booking_reference ? `PNR ${f.booking_reference}` : null, f.amount != null ? formatMoney(f.amount, f.currency ?? "INR") : null]
    .filter(Boolean).join(" · ");
}

/**
 * Drop any file: Excel, CSV, PDF, or a photo of a ticket. Each one is read,
 * analysed and saved on its own; only what could not be worked out is left
 * for a person, with the reason.
 */
export default function AutoUpload({ isManager, onFinished }: { isManager: boolean; onFinished?: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [createMissing, setCreateMissing] = useState(true);
  const [pastEmployees, setPastEmployees] = useState(false);
  const [newPeople, setNewPeople] = useState<NewPeopleMode>(isManager ? "temporary_worker" : "ask");
  const [currency, setCurrency] = useState("INR");
  const [drag, setDrag] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const people = useRef<PersonOption[] | null>(null);
  const [peopleList, setPeopleList] = useState<PersonOption[]>([]);

  const patch = (id: string, p: Partial<Item>) => setItems((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)));

  async function loadPeople(fresh = false): Promise<PersonOption[]> {
    if (!people.current || fresh) {
      people.current = await listPeopleOptions();
      setPeopleList(people.current);
    }
    return people.current;
  }
  useEffect(() => { void loadPeople().catch(() => undefined); }, []);

  async function processTicket(item: Item) {
    const r = await autoTicket(item.file, await loadPeople(), (stage) => patch(item.id, { stage }), { mode: newPeople, isManager });
    if (r.status === "group") {
      // Every passenger matched or to be added: save at once. Otherwise ask who they are.
      if (planReady(r.plan)) return saveGroup({ ...item, extraction: r.extraction }, r.plan);
      patch(item.id, { state: "group", stage: "", extraction: r.extraction, group: r.plan, title: `Read the ticket: ${r.plan.length} passengers. Who are they?`, lines: [tripLine(r.extraction)] });
      return;
    }
    if (r.status === "who") {
      patch(item.id, { state: "who", stage: "", extraction: r.extraction, title: "Read the document, but whose is it?", lines: [tripLine(r.extraction), r.extraction.fields.passenger_name ? `Passenger: ${r.extraction.fields.passenger_name} (no single employee with this name)` : "No passenger name on the document"] });
      return;
    }
    showTicket(item.id, r);
  }

  async function saveGroup(item: Item, plan: Array<PassengerPlan & { leaveOut?: boolean }>) {
    if (!item.extraction) return;
    patch(item.id, { state: "working", stage: "Saving the group booking" });
    try {
      const r: GroupResult = await saveGroupTicket(item.file, item.extraction, plan, (stage) => patch(item.id, { stage }));
      const cur = item.extraction.fields.currency ?? "INR";
      const amounts = new Set(r.people.map((p) => p.amount));
      patch(item.id, {
        state: "done", stage: "", group: undefined,
        title: `Saved for ${r.people.length} passengers as a group booking`,
        lines: [
          tripLine(item.extraction),
          r.people.map((p) => `${p.person.full_name}${p.added ? " (new)" : ""}`).join(", "),
          amounts.size === 1 && r.people[0].amount != null ? `${formatMoney(r.people[0].amount, cur)} each, ${formatMoney(item.extraction.fields.amount, cur)} in total` : "Fare split across the passengers",
        ],
        notes: r.notes,
      });
      if (r.people.some((p) => p.added)) void loadPeople(true).catch(() => undefined);
    } catch (err) {
      patch(item.id, { state: "group", stage: "", group: plan, notes: [err instanceof Error ? err.message : "Could not save the group booking."] });
    }
  }

  function setPassenger(item: Item, index: number, value: string) {
    const plan = (item.group ?? []).map((p, i) => {
      if (i !== index) return p;
      if (value === "leave") return { ...p, person: null, add: null, leaveOut: true };
      if (value.startsWith("add:")) return { ...p, person: null, add: value.slice(4) as PassengerPlan["add"], leaveOut: false };
      const person = peopleList.find((x) => x.id === value) ?? null;
      return { ...p, person, add: null, leaveOut: false };
    });
    patch(item.id, { group: plan });
  }

  function showTicket(id: string, r: FiledTicket) {
    if (r.status === "saved") {
      patch(id, { state: "done", stage: "", extraction: r.extraction, title: `Trip ${r.created ? "saved" : "matched to an existing trip"} for ${r.employee.full_name}`, lines: [tripLine(r.extraction)], notes: r.notes });
    } else {
      patch(id, { state: "review", stage: "", extraction: r.extraction, title: `Filed under ${r.employee.full_name}; needs a quick check`, lines: [tripLine(r.extraction)], notes: [r.reason] });
    }
  }

  async function processSheet(item: Item, kind: "csv" | "xlsx" | "pdf", sheets?: Awaited<ReturnType<typeof readUploadFile>>) {
    const opts: AutoOptions = { createMissing, currency, pastEmployees, isManager, newPeople };
    patch(item.id, { stage: "Reading every sheet" });
    const read = sheets ?? (await readUploadFile(item.file, kind));
    const r = await autoImportSheets(item.file, kind, read, opts, (stage) => patch(item.id, { stage }));
    const b = r.batch;
    const lines = [
      `${b.imported_rows} of ${b.total_rows} lines saved`,
      `Travellers: ${r.linked} matched to people already in the app${r.added ? `, ${r.added} added ${r.addedAs === "permanent_employee" ? "as permanent employees" : r.addedAs === "temporary_worker" ? "to the temporary workforce" : "as new people (kind of worker unknown)"}` : ""}`,
      ...(r.projectsLinked || r.projectsCreated ? [`Projects: ${r.projectsLinked} matched${r.projectsCreated ? `, ${r.projectsCreated} new` : ""}`] : []),
    ];
    patch(item.id, { state: "done", stage: "", title: "Imported", lines, notes: r.notes, reportId: b.id });
    if (r.added) void loadPeople(true).catch(() => undefined);
  }

  async function processOne(item: Item) {
    patch(item.id, { state: "working", stage: "Reading the file" });
    try {
      const head = new Uint8Array(await item.file.slice(0, 16).arrayBuffer());
      const route = routeFor(item.file.name, item.file.size, head);
      if (!route.ok) { patch(item.id, { state: "error", stage: "", title: route.error }); return; }
      patch(item.id, { route: route.route });
      if (route.route === "ticket") return await processTicket(item);
      if (route.route === "sheet") return await processSheet(item, item.file.name.toLowerCase().endsWith(".csv") ? "csv" : "xlsx");
      // PDF: tables (a booking list, a statement) are imported; anything else is a ticket.
      const tables = await readPdfSheets(item.file);
      if (tables) {
        try {
          return await processSheet(item, "pdf", tables);
        } catch (err) {
          if (!(err instanceof NoBookingsFound)) throw err;
        }
      }
      patch(item.id, { route: "ticket" });
      await processTicket(item);
    } catch (err) {
      if (err instanceof NoBookingsFound) {
        patch(item.id, { state: "error", stage: "", title: "No bookings found", notes: ["No sheet in this file has a traveller, date or cost column. Try “Review step by step” to choose the columns yourself."] });
        return;
      }
      patch(item.id, { state: "error", stage: "", title: err instanceof Error ? err.message : "The file could not be read." });
    }
  }

  function addFiles(list: FileList | File[] | null | undefined) {
    const files = Array.from(list ?? []).slice(0, 20);
    if (!files.length) return;
    const added: Item[] = files.map((file) => ({ id: crypto.randomUUID(), file, route: null, state: "waiting", stage: "Waiting" }));
    setItems((prev) => [...added, ...prev]);
    // One at a time keeps the scanner under its rate limit and the order clear.
    for (const item of added) queue.current = queue.current.then(() => processOne(item));
    void queue.current.then(() => { onFinished?.(); toast.success(files.length === 1 ? "Upload finished" : `${files.length} uploads finished`); });
  }

  async function assign(item: Item, personId: string) {
    const person = peopleList.find((p) => p.id === personId);
    if (!person || !item.extraction) return;
    patch(item.id, { state: "working", stage: `Saving for ${person.full_name}` });
    try {
      showTicket(item.id, await fileTicket(item.file, item.extraction, person));
    } catch (err) {
      patch(item.id, { state: "who", stage: "", notes: [err instanceof Error ? err.message : "Could not save."] });
    }
  }

  const busy = items.some((i) => i.state === "working" || i.state === "waiting");

  return (
    <>
      <label
        className={`panel p-8 grid place-items-center text-center gap-3 cursor-pointer border-dashed ${drag ? "ring-2 ring-offset-2" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
      >
        <Sparkles size={30} />
        <strong>Drop any file here: Excel, CSV, PDF, or a photo of a ticket or invoice</strong>
        <span className="text-xs opacity-75 max-w-2xl">
          The app reads it and saves what it finds, no steps to click through. Booking sheets and statements are imported line by line, with
          travellers matched to employees and project names to projects. Tickets, invoices and boarding passes are scanned, filed under the
          right employee and saved as trips. Anything it is not sure about is listed below for you to check. Up to 20 files at once.
        </span>
        <span className="button button-primary"><Upload size={15} /> Choose files</span>
        <input type="file" multiple className="sr-only" accept={ACCEPT} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      </label>

      {isManager && createMissing && (
        <div className="panel p-4 text-sm flex flex-wrap items-center gap-3">
          <span className="flex-1 min-w-[16rem]"><strong className="inline-flex items-center gap-1"><UserPlus size={14} /> Travellers who are not in the app yet</strong>
            <span className="block text-xs opacity-70 mt-0.5">People already in the app (same ID, same name or a saved spelling) are always matched, never added twice. {newPeople === "ask" ? "New people are added as “kind unknown”; names close to someone on file wait for you." : "Names close to someone on file are added too and marked “Possible duplicate” to check later."}</span>
          </span>
          <select aria-label="Travellers who are not in the app yet" value={newPeople} onChange={(e) => setNewPeople(e.target.value as NewPeopleMode)} disabled={busy}>
            {(Object.keys(NEW_PEOPLE_LABELS) as NewPeopleMode[]).map((m) => <option key={m} value={m}>{NEW_PEOPLE_LABELS[m]}</option>)}
          </select>
        </div>
      )}

      <details className="panel p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Upload settings</summary>
        <div className="grid gap-3 md:grid-cols-2 mt-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" className="mt-1" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} disabled={busy} />
            <span><strong className="inline-flex items-center gap-1"><UserPlus size={14} /> Add travellers who are not employees yet</strong>
              <span className="block text-xs opacity-70 mt-0.5">They get an ID like NEW-1A2B3C4D and no login. Switch off to leave their lines out instead.</span>
            </span>
          </label>
          {isManager && createMissing && (
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-1" checked={pastEmployees} onChange={(e) => setPastEmployees(e.target.checked)} disabled={busy} />
              <span><strong>These sheets are for past employees</strong>
                <span className="block text-xs opacity-70 mt-0.5">People the upload adds are saved as past employees.</span>
              </span>
            </label>
          )}
          <label className="flex items-start gap-3">
            <span className="flex-1"><strong>Currency when the sheet has none</strong>
              <span className="block text-xs opacity-70 mt-0.5">A currency column in the sheet always wins.</span>
            </span>
            <select aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={busy}>
              {["INR", "USD", "EUR", "GBP", "AED", "LRD", "MUR", "KES", "UGX"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
      </details>

      {items.length > 0 && (
        <div className="panel table-panel">
          <div className="table-toolbar">
            <h2 className="section-heading">This session’s uploads</h2>
            {!busy && <button type="button" className="table-action ml-auto" onClick={() => setItems([])}>Clear list</button>}
          </div>
          <ul className="grid gap-2" aria-live="polite">
            {items.map((item) => (
              <li key={item.id} className="border p-3 flex flex-wrap gap-3 items-start" style={{ borderColor: "var(--line)" }}>
                <span className="mt-0.5"><FileIcon item={item} /></span>
                <div className="flex-1 min-w-[220px] grid gap-1">
                  <strong className="truncate" title={item.file.name}>{item.file.name}</strong>
                  {item.stage && <span className="text-xs opacity-75">{item.stage}…</span>}
                  {item.title && <span className="text-sm font-semibold">{item.title}</span>}
                  {item.lines?.map((l) => <span key={l} className="text-sm">{l}</span>)}
                  {item.notes?.map((n) => <span key={n} className="text-xs opacity-80 flex gap-1"><AlertTriangle size={12} className="text-amber-600 shrink-0 mt-0.5" /> {n}</span>)}
                  {item.state === "group" && item.group && (
                    <div className="mt-2 grid gap-2 max-w-2xl">
                      {item.group.map((p, i) => (
                        <label key={`${p.name}-${i}`} className="field">
                          <span>{p.name}</span>
                          <select value={p.leaveOut ? "leave" : p.person ? p.person.id : p.add ? `add:${p.add}` : ""} onChange={(e) => setPassenger(item, i, e.target.value)}>
                            <option value="">Choose who this is…</option>
                            {peopleList.map((x) => <option key={x.id} value={x.id}>{x.full_name} · {x.employee_id}</option>)}
                            {(isManager ? (["temporary_worker", "contract_worker", "outsourced_worker", "permanent_employee", "unknown"] as const) : (["unknown"] as const)).map((t) => (
                              <option key={t} value={`add:${t}`}>Add as new: {WORKFORCE_TYPE_LABELS[t]}</option>
                            ))}
                            <option value="leave">Leave out of this booking</option>
                          </select>
                        </label>
                      ))}
                      <div>
                        <button type="button" className="button button-primary" disabled={!planReady(item.group)} onClick={() => void saveGroup(item, item.group!)}>
                          Save for {item.group.filter((p) => !p.leaveOut).length} passengers
                        </button>
                        <span className="text-xs opacity-70 ml-2">One trip each, the fare split across them, as a group booking.</span>
                      </div>
                    </div>
                  )}
                  {item.state === "who" && (
                    <label className="field max-w-md mt-1">
                      <span>Whose is it?</span>
                      <select defaultValue="" onChange={(e) => e.target.value && void assign(item, e.target.value)}>
                        <option value="">Choose the employee…</option>
                        {peopleList.map((p) => <option key={p.id} value={p.id}>{p.full_name} · {p.employee_id}{p.department ? ` · ${p.department}` : ""}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.reportId && <Link href={`/travel/uploads/${item.reportId}`} className="button button-ghost"><BarChart3 size={14} /> Upload report</Link>}
                  {(item.state === "review" || (item.state === "done" && item.route === "ticket")) && (
                    <Link href="/travel/documents" className="button button-ghost"><ScanLine size={14} /> {item.state === "review" ? "Check it" : "Tickets & documents"}</Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
