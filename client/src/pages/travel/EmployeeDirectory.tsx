import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { FileSpreadsheet, Search } from "lucide-react";
import { exportToXlsx } from "../../utils/exportXlsx";
import { listEmployees, type EmployeeSummary } from "../../lib/data/travel";
import { Empty, ErrorNotice, Loading, PageHeader, formatDate, formatMoney } from "./common";

const PAGE = 50;

/** Employees the signed-in user may see, with live travel totals. */
export default function EmployeeDirectory() {
  const [q, setQ] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState<"current" | "past" | "">("");
  const [applied, setApplied] = useState<{ q: string; department: string; status: "current" | "past" | "" }>({ q: "", department: "", status: "" });
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<EmployeeSummary[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await listEmployees({ ...applied, limit: PAGE, offset: page * PAGE });
      setRows(r.rows);
      setCount(r.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load employees.");
    } finally {
      setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => { void load(); }, [load]);

  const pages = Math.max(1, Math.ceil(count / PAGE));

  /** Every employee matching the current search (all pages), as an Excel sheet. */
  async function exportList() {
    setExporting(true);
    try {
      const all: EmployeeSummary[] = [];
      for (let offset = 0; offset < Math.min(count, 10_000); offset += 200) {
        const r = await listEmployees({ ...applied, limit: 200, offset });
        all.push(...r.rows);
        if (r.rows.length < 200) break;
      }
      await exportToXlsx("employees", "Employees",
        ["Employee ID", "Name", "Department", "Designation", "Status", "Trips", "Travel spend", "Last trip", "Next trip"],
        all.map((e) => [e.employee_code, e.employee_name, e.department, e.designation, e.active ? "Current" : "Past employee",
          Number(e.total_trips), Number(e.total_spend), e.last_trip_date, e.next_trip_date]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export the list.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="page-stack animate-page">
      <PageHeader eyebrow="PEOPLE" title="Employees" description="Current and past employees, including people added from Excel uploads. Open anyone to see their trips and claims and download their report." />
      <form className="panel p-4 flex flex-wrap gap-2" role="search" onSubmit={(e) => { e.preventDefault(); setPage(0); setApplied({ q, department, status }); }}>
        <div className="search-field flex-1 min-w-[200px] max-w-none"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or employee ID" aria-label="Name or employee ID" maxLength={80} /></div>
        <div className="search-field min-w-[160px]"><input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department" aria-label="Department" maxLength={80} /></div>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Employee status" className="min-w-[150px]">
          <option value="">Current and past</option>
          <option value="current">Current employees</option>
          <option value="past">Past employees</option>
        </select>
        <button type="submit" className="button button-primary">Search</button>
        <button type="button" className="button button-ghost" disabled={!count || exporting} onClick={() => void exportList()}><FileSpreadsheet size={15} /> {exporting ? "Exporting…" : "Export list"}</button>
      </form>

      {error && <ErrorNotice message={error} onRetry={load} />}

      <div className="panel table-panel">
        {loading ? <Loading /> : rows.length === 0 ? <Empty title="No employees found" description="Try another name, ID or department." /> : (
          <div className="responsive-table">
            <table>
              <thead><tr><th>Employee</th><th>Department</th><th className="text-right">Trips</th><th className="text-right">Spend</th><th>Last trip</th><th>Next trip</th></tr></thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.employee_id}>
                    <td>
                      <Link href={`/travel/employees/${e.employee_id}`} className="font-semibold hover:underline">{e.employee_name}</Link>
                      <div className="table-subline">{e.employee_code}{e.active ? "" : " · past employee"}</div>
                    </td>
                    <td>{e.department ?? "—"}<div className="table-subline">{e.designation ?? ""}</div></td>
                    <td className="text-right">{e.total_trips}</td>
                    <td className="text-right">{formatMoney(e.total_spend)}</td>
                    <td>{formatDate(e.last_trip_date)}</td>
                    <td>{formatDate(e.next_trip_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-end gap-2 mt-3 text-xs">
            <button type="button" className="button button-ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span>Page {page + 1} of {pages}</span>
            <button type="button" className="button button-ghost" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
