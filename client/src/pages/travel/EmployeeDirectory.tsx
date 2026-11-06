import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { Search } from "lucide-react";
import { listEmployees, type EmployeeSummary } from "../../lib/data/travel";
import { Empty, ErrorNotice, Loading, PageHeader, formatDate, formatMoney } from "./common";

const PAGE = 50;

/** Employees the signed-in user may see, with live travel totals. */
export default function EmployeeDirectory() {
  const [q, setQ] = useState("");
  const [department, setDepartment] = useState("");
  const [applied, setApplied] = useState({ q: "", department: "" });
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

  return (
    <div className="page-stack animate-page">
      <PageHeader eyebrow="PEOPLE" title="Employees" description="Search employees and open their travel history. Totals update as soon as trips are added." />
      <form className="panel p-4 flex flex-wrap gap-2" role="search" onSubmit={(e) => { e.preventDefault(); setPage(0); setApplied({ q, department }); }}>
        <div className="search-field flex-1 min-w-[200px] max-w-none"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or employee ID" aria-label="Name or employee ID" maxLength={80} /></div>
        <div className="search-field min-w-[160px]"><input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department" aria-label="Department" maxLength={80} /></div>
        <button type="submit" className="button button-primary">Search</button>
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
                      <div className="table-subline">{e.employee_code}{e.active ? "" : " · inactive"}</div>
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
