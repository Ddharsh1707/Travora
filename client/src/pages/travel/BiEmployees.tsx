import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "wouter";
import { getEmployees, useBiFilters, type EmployeeRow, type EmployeesReport } from "../../lib/data/bi";
import { recordReportGenerated } from "../../lib/data/travel";
import { exportToCsv } from "../../utils/exportCsv";
import BiFilterBar from "./BiFilterBar";
import { Kpi, Panel, count, dateRange, plural } from "./BiParts";
import { Empty, ErrorNotice, Loading, PageHeader, formatMoney } from "./common";

type Sort = "spend" | "bookings" | "projects" | "places" | "name";

/** Employee Intelligence: who travels, how often, where and for which projects. */
export default function BiEmployees({ scopeLabel }: { scopeLabel: string }) {
  const [filters, setFilters] = useBiFilters();
  const [data, setData] = useState<EmployeesReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("spend");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    getEmployees(filters)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load Employee Intelligence."))
      .finally(() => setLoading(false));
  }, [filters]);
  useEffect(() => load(), [load]);

  const cur = data?.base_currency ?? "INR";
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (data?.employees ?? []).filter((e) => !q || `${e.full_name} ${e.employee_code} ${e.department} ${e.project_list.map((p) => p.name).join(" ")}`.toLowerCase().includes(q));
    const by: Record<Sort, (a: EmployeeRow, b: EmployeeRow) => number> = {
      spend: (a, b) => Number(b.spend) - Number(a.spend) || b.bookings - a.bookings,
      bookings: (a, b) => b.bookings - a.bookings,
      projects: (a, b) => b.projects - a.projects || b.bookings - a.bookings,
      places: (a, b) => b.places - a.places,
      name: (a, b) => a.full_name.localeCompare(b.full_name),
    };
    return [...list].sort(by[sort]);
  }, [data, query, sort]);
  const top = useMemo(() => (data?.employees ?? []).slice(0, 10).map((e) => ({ name: e.full_name, spend: Number(e.spend) })), [data]);

  function download() {
    if (!data) return;
    exportToCsv("employee_intelligence",
      ["Employee ID", "Employee", "Department", "Bookings", `Spend (${cur})`, "Bookings without a cost", "Cancelled", "Projects", "Project names", "Bookings not linked to a project", "Places", "Most visited", "Average days booked ahead", "First travel", "Last travel"],
      rows.map((e) => [e.employee_code, e.full_name, e.department, e.bookings, e.spend, e.without_cost, e.cancelled, e.projects, e.project_list.map((p) => p.name).join("; "), e.unassigned, e.places, e.top_destination ?? "", e.avg_advance_days ?? "", e.first_date, e.last_date]));
    void recordReportGenerated("employee_intelligence").catch(() => undefined);
  }

  const k = data?.kpis;
  return (
    <div className="page-stack animate-page">
      <PageHeader
        eyebrow="BUSINESS INTELLIGENCE"
        title="Employee Intelligence"
        description={`Travel by person for ${scopeLabel}. Projects come only from the project linked to each booking.`}
        actions={<button type="button" className="button button-ghost" onClick={download} disabled={!data?.employees.length}><Download size={14} /> Download CSV</button>}
      />
      <BiFilterBar filters={filters} onChange={setFilters} hide={["employee"]} />
      {error && <ErrorNotice message={error} onRetry={load} />}
      {loading && !data && <Loading label="Adding up travel per person…" />}

      {data && k && (k.travellers === 0 ? <Empty title="No travellers match" description="Clear some filters." /> : (
        <div className={`page-stack ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Kpi label="Travellers" value={count(k.travellers)} detail={`${count(k.bookings)} bookings`} />
            <Kpi label="Bookings per traveller" value={k.avg_bookings == null ? "—" : String(k.avg_bookings)} detail="Average" />
            <Kpi label="On more than one project" value={count(k.multi_project)} detail="Travellers with bookings linked to 2 or more projects" />
            <Kpi label="Top 5 travellers' share" value={k.spend > 0 ? `${Math.round((k.top5_spend / k.spend) * 100)}%` : "—"} detail={`${formatMoney(k.top5_spend, cur)} of ${formatMoney(k.spend, cur)}`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Highest spend" note={`Top 10 travellers, ${cur}`} className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={Math.max(200, top.length * 30)}>
                <BarChart data={top} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--line)" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11, fill: "var(--ink-soft)" }} />
                  <Tooltip formatter={(v: number) => formatMoney(v, cur)} />
                  <Bar dataKey="spend" name="Spend" fill="var(--blue)" radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
            <Panel title="How often people travel" note="Travellers by number of bookings">
              <table className="bi-table">
                <thead><tr><th>Bookings</th><th className="text-right">Travellers</th><th className="text-right">Spend</th></tr></thead>
                <tbody>{data.frequency.map((f) => <tr key={f.bucket}><td>{f.bucket}</td><td className="text-right">{count(f.travellers)}</td><td className="text-right">{formatMoney(f.spend, cur)}</td></tr>)}</tbody>
              </table>
              {data.departments.length > 1 && (
                <>
                  <h3 className="card-kicker mt-4 mb-1">By department</h3>
                  <table className="bi-table">
                    <tbody>{data.departments.map((d) => <tr key={d.department}><td>{d.department}</td><td className="text-right">{plural(d.travellers, "person", "people")}</td><td className="text-right">{formatMoney(d.spend, cur)}</td></tr>)}</tbody>
                  </table>
                </>
              )}
            </Panel>
          </div>

          <div className="panel table-panel">
            <div className="table-toolbar flex-wrap gap-2">
              <label className="toolbar-filters relative">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-60" aria-hidden />
                <input type="search" className="pl-7" placeholder="Search name, ID, department or project" aria-label="Search travellers" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
              <label className="toolbar-filters" style={{ flex: "0 0 auto" }}>
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by">
                  <option value="spend">Highest spend</option><option value="bookings">Most bookings</option>
                  <option value="projects">Most projects</option><option value="places">Most places</option><option value="name">Name</option>
                </select>
              </label>
            </div>
            <div className="responsive-table">
              <table>
                <thead><tr><th>Traveller</th><th className="text-right">Bookings</th><th className="text-right">Spend</th><th>Projects</th><th>Places</th><th className="text-right">Booked ahead</th><th>Travel</th></tr></thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.employee_id}>
                      <td><Link href={`/travel/employees/${e.employee_id}`} className="font-semibold hover:underline">{e.full_name}</Link><div className="table-subline">{[e.employee_code, e.department].filter(Boolean).join(" · ")}</div></td>
                      <td className="text-right">{count(e.bookings)}{(e.cancelled > 0 || e.no_show > 0) && <div className="table-subline">{[e.cancelled && `${e.cancelled} cancelled`, e.no_show && `${e.no_show} no-show`].filter(Boolean).join(", ")}</div>}</td>
                      <td className="text-right">{formatMoney(e.spend, cur)}{e.without_cost > 0 && <div className="table-subline">{e.without_cost} without cost</div>}</td>
                      <td className="text-xs">
                        {e.project_list.slice(0, 3).map((p) => <Link key={p.id} href={`/travel/bi/projects/${p.id}`} className="bi-tag mr-1 mb-1 hover:underline">{p.name} · {p.bookings}</Link>)}
                        {e.project_list.length > 3 && <span className="opacity-60">+{e.project_list.length - 3}</span>}
                        {e.unassigned > 0 && <div className="table-subline">{e.unassigned} not linked</div>}
                      </td>
                      <td className="text-xs">{plural(e.places, "place")}{e.top_destination && <div className="table-subline">Most: {e.top_destination}</div>}</td>
                      <td className="text-right text-xs">{e.avg_advance_days == null ? "—" : `${e.avg_advance_days} days`}</td>
                      <td className="text-xs whitespace-nowrap">{dateRange(e.first_date, e.last_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs opacity-70 p-3">"Booked ahead" is the average number of days between the booking date and the travel date, for bookings where the sheet has both.</p>
          </div>
        </div>
      ))}
    </div>
  );
}
