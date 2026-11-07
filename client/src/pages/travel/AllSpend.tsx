import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Paperclip, Search } from "lucide-react";
import { Link } from "wouter";
import { CATEGORY_LABELS, EXPENSE_CATEGORIES } from "../../lib/data/expenses";
import { listPeopleOptions, listProjects, type PersonOption, type Project } from "../../lib/data/imports";
import { useLiveRefresh } from "../../lib/data/reports";
import { SOURCE_LABEL, SPEND_LIMIT, listSpendItems, summarizeSpend, type SpendFilters, type SpendItem } from "../../lib/data/spend";
import { exportToCsv } from "../../utils/exportCsv";
import { exportToXlsx } from "../../utils/exportXlsx";
import { Empty, ErrorNotice, Loading, Stat, formatDate, formatMoney } from "./common";

const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Quick periods: this week (Mon-Sun), last week, this month, last month. */
export function periodRange(kind: "this_week" | "last_week" | "this_month" | "last_month", today = new Date()): { from: string; to: string } {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (kind === "this_week" || kind === "last_week") {
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7) - (kind === "last_week" ? 7 : 0));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: isoDate(monday), to: isoDate(sunday) };
  }
  const offset = kind === "last_month" ? -1 : 0;
  return { from: isoDate(new Date(d.getFullYear(), d.getMonth() + offset, 1)), to: isoDate(new Date(d.getFullYear(), d.getMonth() + offset + 1, 0)) };
}

const TRIP_CATEGORIES = ["train", "bus", "cab", "hotel", "multi_modal", "other"];
const STATUSES = [
  ["submitted", "Claim waiting for review"], ["approved", "Claim approved"], ["reimbursed", "Claim reimbursed"],
  ["rejected", "Claim rejected"], ["withdrawn", "Claim withdrawn"], ["confirmed", "Trip confirmed"],
  ["completed", "Trip completed"], ["cancelled", "Trip cancelled"],
] as const;

/** Admin and CEO: every claim and every travel desk trip (Excel uploads included) in one filterable list. */
export default function AllSpend() {
  const [f, setF] = useState<SpendFilters>(() => periodRange("this_month"));
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<SpendItem[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void listPeopleOptions().then(setPeople).catch(() => setPeople([]));
    void listProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  const load = useCallback(async () => {
    setError("");
    try {
      const r = await listSpendItems({ ...f, q });
      setRows(r.rows);
      setTruncated(r.truncated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load spend.");
    } finally {
      setLoading(false);
    }
  }, [f, q]);
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);
  useLiveRefresh(["expenses", "travel_records"], load);

  const totals = useMemo(() => summarizeSpend(rows), [rows]);
  const departments = useMemo(() => Array.from(new Set(people.map((p) => p.department || "Not recorded"))).sort(), [people]);
  const set = (k: keyof SpendFilters) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const categoryLabel = (c: string) => CATEGORY_LABELS[c as keyof typeof CATEGORY_LABELS] ?? c.replace("_", " ");
  const period = f.from || f.to ? `${f.from ? formatDate(f.from) : "start"} to ${f.to ? formatDate(f.to) : "today"}` : "all dates";

  const HEADERS = ["Date", "Source", "Entered by", "Employee", "Employee ID", "Department", "Category", "Description", "Project", "From", "To", "PNR", "Amount", "Currency", "Counted in total", "Status"];
  const exportRows = () => rows.map((r) => [r.spend_date, SOURCE_LABEL[r.source], r.entered_by, r.employee_name, r.employee_code, r.department, categoryLabel(r.category),
    r.description, r.project_name, r.origin, r.destination, r.booking_reference, r.amount === null ? null : Number(r.amount), r.currency, Number(r.counted), r.status]);

  return (
    <>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="Total spend" value={formatMoney(totals.total)} detail={`${totals.records} records · ${period}`} />
        <Stat label="Employee claims" value={formatMoney(totals.claims)} detail="Waiting, approved and paid" />
        <Stat label="Travel desk trips" value={formatMoney(totals.trips)} detail="Excel uploads and bookings" />
        <Stat label="Not counted" value={formatMoney(totals.notCounted)} detail={`Rejected, withdrawn or cancelled${totals.missing ? ` · ${totals.missing} without an amount` : ""}`} />
      </div>

      <div className="panel p-4 flex flex-wrap gap-2 items-end">
        <div className="flex flex-wrap gap-1 w-full">
          {([["this_week", "This week"], ["last_week", "Last week"], ["this_month", "This month"], ["last_month", "Last month"]] as const).map(([k, label]) => (
            <button key={k} type="button" className="button button-ghost" onClick={() => setF((x) => ({ ...x, ...periodRange(k) }))}>{label}</button>
          ))}
          <button type="button" className="button button-ghost" onClick={() => setF((x) => ({ ...x, from: "", to: "" }))}>All dates</button>
        </div>
        <label className="field"><span>From</span><input type="date" value={f.from ?? ""} onChange={set("from")} /></label>
        <label className="field"><span>To</span><input type="date" value={f.to ?? ""} onChange={set("to")} /></label>
        <label className="field min-w-[150px]"><span>Source</span>
          <select value={f.source ?? ""} onChange={set("source")}>
            <option value="">Claims and trips</option>
            <option value="claim">Employee claims</option>
            <option value="trip">Travel desk trips / Excel uploads</option>
          </select>
        </label>
        <label className="field min-w-[170px]"><span>Employee</span>
          <select value={f.employee ?? ""} onChange={set("employee")}>
            <option value="">Everyone</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.full_name} ({p.employee_id})</option>)}
          </select>
        </label>
        <label className="field min-w-[150px]"><span>Department</span>
          <select value={f.department ?? ""} onChange={set("department")}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="field min-w-[150px]"><span>Project</span>
          <select value={f.project ?? ""} onChange={set("project")}>
            <option value="">All projects</option>
            <option value="none">No project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="field min-w-[140px]"><span>Category</span>
          <select value={f.category ?? ""} onChange={set("category")}>
            <option value="">All categories</option>
            {Array.from(new Set([...EXPENSE_CATEGORIES, ...TRIP_CATEGORIES])).map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
          </select>
        </label>
        <label className="field min-w-[150px]"><span>Status</span>
          <select value={f.status ?? ""} onChange={set("status")}>
            <option value="">Any status</option>
            {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <div className="search-field flex-1 min-w-[200px] max-w-none"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, ID, place, project, PNR or description" aria-label="Search spend" maxLength={80} /></div>
        <button type="button" className="button button-ghost" disabled={!rows.length} onClick={() => exportToCsv("all_spend", HEADERS, exportRows())}><Download size={15} /> CSV</button>
        <button type="button" className="button button-ghost" disabled={!rows.length} onClick={() => void exportToXlsx("all_spend", "All spend", HEADERS, exportRows())}><FileSpreadsheet size={15} /> Excel</button>
      </div>

      {truncated && <p className="text-sm" role="status">Showing the latest {SPEND_LIMIT.toLocaleString("en-IN")} records. Narrow the dates to see the rest; totals cover only the rows shown.</p>}
      {error && <ErrorNotice message={error} onRetry={load} />}
      <div className="panel table-panel">
        {loading ? <Loading /> : rows.length === 0 ? <Empty title="No spend found" description="Change the dates or filters." /> : (
          <div className="responsive-table">
            <table>
              <thead><tr><th>Date</th><th>Employee</th><th>What for</th><th>Project</th><th className="text-right">Amount</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.source}-${r.id}`} className={Number(r.counted) === 0 && r.amount ? "opacity-60" : ""}>
                    <td>{formatDate(r.spend_date)}</td>
                    <td>
                      <Link href={`/travel/employees/${r.employee_id}`} className="font-semibold hover:underline">{r.employee_name}</Link>
                      <div className="table-subline">{r.employee_code} · {r.department}</div>
                    </td>
                    <td className="max-w-[280px]">
                      <div className="truncate" title={r.description ?? ""}>{r.description || categoryLabel(r.category)}</div>
                      <div className="table-subline">
                        {categoryLabel(r.category)} · {r.entered_by}
                        {r.booking_reference ? ` · PNR ${r.booking_reference}` : ""}
                        {r.has_receipt && <> · <Paperclip size={11} className="inline" /> receipt</>}
                        {r.import_batch_id && <> · <Link href={`/travel/uploads/${r.import_batch_id}`} className="underline">upload report</Link></>}
                      </div>
                    </td>
                    <td>{r.project_name ?? "—"}</td>
                    <td className="text-right font-semibold">{r.amount === null ? <span className="opacity-60">not recorded</span> : formatMoney(r.amount, r.currency)}</td>
                    <td><span className="text-sm">{r.status}</span><div className="table-subline">{SOURCE_LABEL[r.source]}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
