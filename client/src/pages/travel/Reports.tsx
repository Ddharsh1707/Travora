import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Radio } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "wouter";
import { chartRange, fillMonths, getTravelReport, monthLabel, presetRange, rangeError, useLiveRefresh, type DateRange, type RangePreset, type TravelReport } from "../../lib/data/reports";
import { listDepartments, recordReportGenerated } from "../../lib/data/travel";
import { exportToCsv } from "../../utils/exportCsv";
import { Empty, ErrorNotice, Loading, PageHeader, Stat, formatMoney, labelFor, routeLabel } from "./common";

const MODES = ["flight", "train", "bus", "cab", "hotel", "multi_modal", "other"];
const PALETTE = ["var(--saffron)", "var(--blue)", "var(--green)", "#f59e0b", "#a855f7", "#64748b", "#ef4444"];
const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

/**
 * Travel reports. The numbers come from travel_report(), which runs with the
 * viewer's own permissions: employees see their own trips, approvers their
 * team, Travel Desk / Admin everyone. Updates live when trips change.
 */
export default function Reports({ scopeLabel }: { scopeLabel: string }) {
  const [preset, setPreset] = useState<RangePreset>("this_fy");
  const [range, setRange] = useState<DateRange>(() => presetRange("this_fy"));
  const [department, setDepartment] = useState("");
  const [mode, setMode] = useState("");
  const [departments, setDepartments] = useState<string[]>([]);
  const [report, setReport] = useState<TravelReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [liveAt, setLiveAt] = useState<Date | null>(null);

  useEffect(() => { listDepartments().then(setDepartments).catch(() => setDepartments([])); }, []);

  const load = useCallback((quiet = false) => {
    const problem = rangeError(range);
    if (problem) { setError(problem); return; }
    if (!quiet) setLoading(true);
    setError("");
    getTravelReport(range, { department, mode })
      .then((r) => { setReport(r); if (quiet) setLiveAt(new Date()); })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the report."))
      .finally(() => setLoading(false));
  }, [range, department, mode]);
  useEffect(() => load(), [load]);
  useLiveRefresh(["travel_records"], () => load(true));

  function choosePreset(p: RangePreset) {
    setPreset(p);
    if (p !== "custom") setRange(presetRange(p));
  }

  // Months after today only appear when trips are already booked for them.
  const months = useMemo(() => (report ? fillMonths(chartRange(range, report.by_month), report.by_month).map((m) => ({ ...m, label: monthLabel(m.month) })) : []), [report, range]);
  const currency = report?.totals.currencies.length === 1 ? report.totals.currencies[0] : "INR";
  const mixedCurrency = (report?.totals.currencies.length ?? 0) > 1;

  function download() {
    if (!report) return;
    const rows: (string | number)[][] = [];
    rows.push(["Summary", "Trips", String(report.totals.trips), "Spend", String(report.totals.spend)]);
    for (const m of report.by_month) rows.push(["Month", m.month, String(m.trips), "Spend", String(m.spend)]);
    for (const d of report.by_department) rows.push(["Department", d.department, String(d.trips), "Spend", String(d.spend)]);
    for (const m of report.by_mode) rows.push(["Mode", labelFor(m.mode), String(m.trips), "Spend", String(m.spend)]);
    for (const r of report.top_routes) rows.push(["Route", `${r.origin} - ${r.destination}`, String(r.trips), "Spend", String(r.spend)]);
    for (const t of report.top_travellers) rows.push(["Traveller", `${t.full_name} (${t.employee_code})`, String(t.trips), "Spend", String(t.spend)]);
    exportToCsv(`travel_report_${range.from}_${range.to}`, ["Section", "Item", "Trips", "Measure", "Value"], rows);
    void recordReportGenerated("travel_report").catch(() => undefined);
  }

  return (
    <div className="page-stack animate-page">
      <PageHeader
        eyebrow="Travel"
        title="Reports"
        description={`Trips and spend for ${scopeLabel}. Cancelled trips are left out.`}
        actions={<button type="button" className="button button-ghost" onClick={download} disabled={!report || report.totals.trips === 0}><Download size={14} /> Download CSV</button>}
      />

      <div className="panel p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end">
        <label className="field"><span>Period</span>
          <select value={preset} onChange={(e) => choosePreset(e.target.value as RangePreset)}>
            <option value="this_fy">This financial year</option>
            <option value="last_fy">Last financial year</option>
            <option value="last_12_months">Last 12 months</option>
            <option value="this_month">This month</option>
            <option value="custom">Custom dates</option>
          </select>
        </label>
        <label className="field"><span>From</span><input type="date" value={range.from} onChange={(e) => { setPreset("custom"); setRange((r) => ({ ...r, from: e.target.value })); }} /></label>
        <label className="field"><span>To</span><input type="date" value={range.to} onChange={(e) => { setPreset("custom"); setRange((r) => ({ ...r, to: e.target.value })); }} /></label>
        <label className="field"><span>Department</span>
          <select value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="field"><span>Mode</span>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="">All modes</option>
            {MODES.map((m) => <option key={m} value={m}>{labelFor(m)}</option>)}
          </select>
        </label>
      </div>

      <p className="text-xs opacity-70 flex items-center gap-1" aria-live="polite"><Radio size={12} className="text-green-600" /> Live: updates when trips are added or changed{liveAt ? ` · last update ${liveAt.toLocaleTimeString("en-IN")}` : ""}.</p>

      {error && <ErrorNotice message={error} onRetry={() => load()} />}
      {loading && !report ? <Loading label="Building report…" /> : report && (
        report.totals.trips === 0 ? <Empty title="No trips in this period" description="Try a wider date range or remove a filter." /> : (
          <>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Stat label="Total spend" value={formatMoney(report.totals.spend, currency)} detail={mixedCurrency ? `Mixed currencies: ${report.totals.currencies.join(", ")}` : report.totals.trips_without_cost ? `${report.totals.trips_without_cost} trips have no cost yet` : undefined} />
              <Stat label="Trips" value={report.totals.trips.toLocaleString("en-IN")} detail={report.totals.upcoming ? `${report.totals.upcoming} still upcoming` : undefined} />
              <Stat label="Travellers" value={report.totals.travellers.toLocaleString("en-IN")} />
              <Stat label="Average per trip" value={formatMoney(report.totals.trips - report.totals.trips_without_cost > 0 ? report.totals.spend / (report.totals.trips - report.totals.trips_without_cost) : 0, currency)} />
            </div>

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
              <ChartPanel title="Trips by month">
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={months} margin={{ left: 0, right: 8, top: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--ink-soft)" }} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--ink-soft)" }} width={36} />
                    <Tooltip />
                    <Line type="monotone" dataKey="trips" name="Trips" stroke="var(--blue)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="travellers" name="Travellers" stroke="var(--green)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="Spend by department">
                <ResponsiveContainer width="100%" height={Math.max(160, report.by_department.slice(0, 8).length * 34)}>
                  <BarChart data={report.by_department.slice(0, 8)} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="department" width={110} tick={{ fontSize: 11, fill: "var(--ink-soft)" }} />
                    <Tooltip formatter={(v: number) => formatMoney(v, currency)} />
                    <Bar dataKey="spend" name="Spend" fill="var(--saffron)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="Trips by mode">
                <ResponsiveContainer width="100%" height={Math.max(160, report.by_mode.length * 34)}>
                  <BarChart data={report.by_mode.map((m) => ({ ...m, label: labelFor(m.mode) }))} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis type="category" dataKey="label" width={90} tick={{ fontSize: 11, fill: "var(--ink-soft)" }} />
                    <Tooltip />
                    <Bar dataKey="trips" name="Trips" radius={[0, 4, 4, 0]}>
                      {report.by_mode.map((m, i) => <Cell key={m.mode} fill={PALETTE[i % PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <TablePanel title="Top routes" headers={["Route", "Trips", "Spend"]}>
                {report.top_routes.map((r) => (
                  <tr key={`${r.origin}-${r.destination}`}><td>{routeLabel(r.origin, r.destination)}</td><td className="text-right">{r.trips}</td><td className="text-right">{formatMoney(r.spend, currency)}</td></tr>
                ))}
              </TablePanel>
              <TablePanel title="Top travellers by spend" headers={["Traveller", "Trips", "Spend"]}>
                {report.top_travellers.map((t) => (
                  <tr key={t.employee_id}>
                    <td><Link href={`/travel/employees/${t.employee_id}`} className="font-semibold hover:underline">{t.full_name}</Link><div className="table-subline">{t.employee_code} · {t.department}</div></td>
                    <td className="text-right">{t.trips}</td><td className="text-right">{formatMoney(t.spend, currency)}</td>
                  </tr>
                ))}
              </TablePanel>
              <TablePanel title="Providers" headers={["Provider", "Trips", "Spend"]}>
                {report.top_providers.map((p) => (
                  <tr key={p.provider}><td>{p.provider}</td><td className="text-right">{p.trips}</td><td className="text-right">{formatMoney(p.spend, currency)}</td></tr>
                ))}
              </TablePanel>
              <TablePanel title="How trips were recorded" headers={["Source", "Trips", ""]}>
                {report.by_source.map((s) => (
                  <tr key={s.source}><td>{{ manual: "Entered by hand", import: "Excel / CSV import", document: "Scanned ticket", bulk_booking: "Bulk booking", legacy: "Old system" }[s.source] ?? s.source}</td><td className="text-right">{s.trips}</td><td /></tr>
                ))}
              </TablePanel>
            </div>
          </>
        )
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
