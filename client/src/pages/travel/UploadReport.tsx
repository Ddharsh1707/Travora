import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, Search } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "wouter";
import { getUploadReport, type UploadReport as Report } from "../../lib/data/imports";
import { monthLabel } from "../../lib/data/reports";
import { recordReportGenerated } from "../../lib/data/travel";
import { exportToCsv } from "../../utils/exportCsv";
import { Empty, ErrorNotice, Loading, PageHeader, Stat, formatDate, formatMoney, labelFor, routeLabel } from "./common";

const PALETTE = ["var(--saffron)", "var(--blue)", "var(--green)", "#f59e0b", "#a855f7", "#64748b", "#ef4444"];
const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

/**
 * The report for one uploaded travel sheet: totals, charts, routes, providers
 * and every employee in the file, each linking to their full travel history.
 * import_report() refuses anyone who is not Travel Desk or CEO.
 */
export default function UploadReport({ batchId }: { batchId: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    getUploadReport(batchId)
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the upload report."))
      .finally(() => setLoading(false));
  }, [batchId]);
  useEffect(() => load(), [load]);

  const months = useMemo(() => (report?.by_month ?? []).map((m) => ({ ...m, label: monthLabel(m.month) })), [report]);
  const employees = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = report?.employees ?? [];
    if (!q) return all;
    return all.filter((e) => `${e.full_name} ${e.employee_code} ${e.department}`.toLowerCase().includes(q));
  }, [report, query]);

  if (loading && !report) return <div className="page-stack"><Loading label="Building the upload report…" /></div>;
  if (error) return <div className="page-stack"><ErrorNotice message={error} onRetry={load} /></div>;
  if (!report) return null;

  const { batch, totals } = report;
  const currency = totals.currencies.length === 1 ? totals.currencies[0] : "INR";
  const costed = totals.trips - totals.trips_without_cost;

  function download() {
    if (!report) return;
    exportToCsv(
      `upload_report_${batch.original_filename.replace(/\.[^.]+$/, "")}`,
      ["Employee ID", "Employee", "Department", "Trips", "Spend", "First trip", "Last trip"],
      report.employees.map((e) => [e.employee_code, e.full_name, e.department, e.trips, e.spend, e.first_trip, e.last_trip]),
    );
    void recordReportGenerated("upload_report").catch(() => undefined);
  }

  return (
    <div className="page-stack animate-page">
      <Link href="/travel/import" className="text-xs inline-flex items-center gap-1 hover:underline"><ArrowLeft size={13} /> Travel desk uploads</Link>
      <PageHeader
        eyebrow="UPLOAD REPORT"
        title={batch.original_filename}
        description={`Uploaded ${formatDate(batch.committed_at ?? batch.created_at)} · ${batch.imported_rows} of ${batch.total_rows} rows imported${batch.created_employees ? ` · ${batch.created_employees} new employee${batch.created_employees === 1 ? "" : "s"} added` : ""}${totals.first_date ? ` · trips from ${formatDate(totals.first_date)} to ${formatDate(totals.last_date)}` : ""}`}
        actions={<button type="button" className="button button-ghost" onClick={download} disabled={!report.employees.length}><Download size={14} /> Download CSV</button>}
      />

      {totals.trips === 0 ? (
        <Empty title="No trips from this upload" description="Nothing from this file was imported, or the trips were cancelled since." />
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Stat label="Total spend" value={formatMoney(totals.spend, currency)} detail={totals.currencies.length > 1 ? `Mixed currencies: ${totals.currencies.join(", ")}` : totals.trips_without_cost ? `${totals.trips_without_cost} trip${totals.trips_without_cost === 1 ? " has" : "s have"} no amount` : undefined} />
            <Stat label="Trips" value={totals.trips.toLocaleString("en-IN")} detail={totals.upcoming ? `${totals.upcoming} still upcoming` : undefined} />
            <Stat label="Employees" value={totals.travellers.toLocaleString("en-IN")} />
            <Stat label="Average per trip" value={formatMoney(costed > 0 ? totals.spend / costed : 0, currency)} />
          </div>

          {(batch.error_rows > 0 || batch.duplicate_rows > 0) && (
            <p className="text-xs opacity-70">Left out of this report: {batch.error_rows} row{batch.error_rows === 1 ? "" : "s"} with errors and {batch.duplicate_rows} duplicate{batch.duplicate_rows === 1 ? "" : "s"} that were already recorded.</p>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartPanel title="Spend by month">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={months} margin={{ left: 0, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--ink-soft)" }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: "var(--ink-soft)" }} tickFormatter={(v: number) => compact.format(v)} width={48} />
                  <Tooltip formatter={(v: number) => formatMoney(v, currency)} />
                  <Bar dataKey="spend" name="Spend" fill="var(--saffron)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
            <ChartPanel title="Spend by department">
              <ResponsiveContainer width="100%" height={Math.max(180, report.by_department.slice(0, 8).length * 34)}>
                <BarChart data={report.by_department.slice(0, 8)} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="department" width={110} tick={{ fontSize: 11, fill: "var(--ink-soft)" }} />
                  <Tooltip formatter={(v: number) => formatMoney(v, currency)} />
                  <Bar dataKey="spend" name="Spend" fill="var(--blue)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
            <ChartPanel title="Trips by travel mode">
              <div className="flex flex-wrap items-center gap-4">
                <div style={{ width: 180, height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={report.by_mode.map((m) => ({ ...m, label: labelFor(m.mode) }))} dataKey="trips" nameKey="label" innerRadius={48} outerRadius={80} paddingAngle={2}>
                        {report.by_mode.map((m, i) => <Cell key={m.mode} fill={PALETTE[i % PALETTE.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="text-sm grid gap-1">
                  {report.by_mode.map((m, i) => (
                    <li key={m.mode} className="flex items-center gap-2">
                      <span aria-hidden style={{ width: 10, height: 10, background: PALETTE[i % PALETTE.length], display: "inline-block" }} />
                      {labelFor(m.mode)}: <strong>{m.trips}</strong> <span className="opacity-70">({formatMoney(m.spend, currency)})</span>
                    </li>
                  ))}
                </ul>
              </div>
            </ChartPanel>
            <TablePanel title="Top routes" headers={["Route", "Trips", "Spend"]}>
              {report.top_routes.map((r) => (
                <tr key={`${r.origin}-${r.destination}`}><td>{routeLabel(r.origin, r.destination)}</td><td className="text-right">{r.trips}</td><td className="text-right">{formatMoney(r.spend, currency)}</td></tr>
              ))}
            </TablePanel>
          </div>

          <TablePanel title="Airlines and providers" headers={["Provider", "Trips", "Spend"]}>
            {report.top_providers.map((p) => (
              <tr key={p.provider}><td>{p.provider}</td><td className="text-right">{p.trips}</td><td className="text-right">{formatMoney(p.spend, currency)}</td></tr>
            ))}
          </TablePanel>

          <div className="panel table-panel">
            <div className="table-toolbar flex-wrap">
              <div>
                <h2 className="section-heading">Employees in this upload</h2>
                <p className="text-xs opacity-70">Open an employee to see their full travel history, including trips from other uploads.</p>
              </div>
              <label className="toolbar-filters relative">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-60" aria-hidden />
                <input type="search" className="pl-7" placeholder="Search name, ID or department" aria-label="Search employees" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
            </div>
            {employees.length === 0 ? <Empty title="No matching employees" description="Try a different search." /> : (
              <div className="responsive-table">
                <table>
                  <thead><tr><th>Employee</th><th>Department</th><th className="text-right">Trips</th><th className="text-right">Spend</th><th>First trip</th><th>Last trip</th><th><span className="sr-only">History</span></th></tr></thead>
                  <tbody>
                    {employees.map((e) => (
                      <tr key={e.employee_id}>
                        <td><Link href={`/travel/employees/${e.employee_id}`} className="font-semibold hover:underline">{e.full_name}</Link><div className="table-subline">{e.employee_code}</div></td>
                        <td>{e.department}</td>
                        <td className="text-right">{e.trips}</td>
                        <td className="text-right">{formatMoney(e.spend, currency)}</td>
                        <td>{formatDate(e.first_trip)}</td>
                        <td>{formatDate(e.last_trip)}</td>
                        <td><Link href={`/travel/employees/${e.employee_id}`} className="table-action">Travel history</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel p-4 min-w-0">
      <h2 className="section-heading mb-2">{title}</h2>
      {children}
    </div>
  );
}

function TablePanel({ title, headers, children }: { title: string; headers: string[]; children: React.ReactNode }) {
  return (
    <div className="panel table-panel min-w-0">
      <div className="table-toolbar"><h2 className="section-heading">{title}</h2></div>
      <div className="responsive-table">
        <table style={{ minWidth: 0 }}>
          <thead><tr>{headers.map((h, i) => <th key={h || i} className={i > 0 ? "text-right" : ""}>{h}</th>)}</tr></thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}
