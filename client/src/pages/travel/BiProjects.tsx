import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Search } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer } from "recharts";
import { Link } from "wouter";
import { KIND_LABEL, STATUS_LABEL, getProjectDetail, getProjects, useBiFilters, type ProjectKind, type ProjectRow, type ProjectStatus, type ProjectsReport } from "../../lib/data/bi";
import { recordReportGenerated } from "../../lib/data/travel";
import { exportToCsv } from "../../utils/exportCsv";
import BiFilterBar from "./BiFilterBar";
import { downloadTeamReport } from "./BiProjectDetail";
import { Kpi, count, dateRange, plural } from "./BiParts";
import { Empty, ErrorNotice, Loading, PageHeader, formatMoney } from "./common";

const STATUS_TONE: Record<ProjectStatus, string> = { active: "approved", completed: "completed", on_hold: "pending-approval", unknown: "booked" };
export function ProjectStatusPill({ status }: { status: ProjectStatus }) {
  return <span className={`status-badge status-${STATUS_TONE[status]}`}><span className="status-dot" />{STATUS_LABEL[status]}</span>;
}

type Sort = "spend" | "bookings" | "travellers" | "name" | "latest";

/** Project Intelligence: travel and spend for every project, from linked bookings only. */
export default function BiProjects({ isCeo }: { isCeo: boolean }) {
  const [filters, setFilters] = useBiFilters();
  const [data, setData] = useState<ProjectsReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ProjectKind | "">("");
  const [withTravel, setWithTravel] = useState(true);
  const [sort, setSort] = useState<Sort>("spend");
  const [busyId, setBusyId] = useState("");
  const [reportError, setReportError] = useState("");

  async function teamReport(p: ProjectRow) {
    setBusyId(p.project_id);
    setReportError("");
    try {
      await downloadTeamReport(await getProjectDetail(p.project_id, filters), p.name, filters, "xlsx");
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Could not create the report.");
    } finally {
      setBusyId("");
    }
  }

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    getProjects(filters)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the projects."))
      .finally(() => setLoading(false));
  }, [filters]);
  useEffect(() => load(), [load]);

  const cur = data?.base_currency ?? "INR";
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (data?.projects ?? []).filter((p) =>
      (!kind || p.kind === kind) && (!withTravel || p.bookings > 0) &&
      (!q || `${p.name} ${p.code ?? ""} ${p.client ?? ""} ${p.site ?? ""}`.toLowerCase().includes(q)));
    const by: Record<Sort, (a: ProjectRow, b: ProjectRow) => number> = {
      spend: (a, b) => Number(b.spend) - Number(a.spend) || b.bookings - a.bookings,
      bookings: (a, b) => b.bookings - a.bookings,
      travellers: (a, b) => b.travellers - a.travellers,
      name: (a, b) => a.name.localeCompare(b.name),
      latest: (a, b) => (b.last_date ?? "").localeCompare(a.last_date ?? ""),
    };
    return [...list].sort(by[sort]);
  }, [data, query, kind, withTravel, sort]);

  function download() {
    if (!data) return;
    exportToCsv("project_intelligence",
      ["Project", "Code", "Type", "Status", "Client", "Bookings", "Travellers", `Spend (${cur})`, `Average per costed booking (${cur})`, "Bookings without a cost", "First travel", "Last travel"],
      rows.map((p) => [p.name, p.code ?? "", KIND_LABEL[p.kind], STATUS_LABEL[p.status], p.client ?? "", p.bookings, p.travellers, p.spend, p.avg_per_booking ?? "", p.without_cost, p.first_date ?? "", p.last_date ?? ""]));
    void recordReportGenerated("project_intelligence").catch(() => undefined);
  }

  return (
    <div className="page-stack animate-page">
      <PageHeader
        eyebrow="BUSINESS INTELLIGENCE"
        title="Project Intelligence"
        description={`Travel booked against each project. A booking counts for a project when its project name in the sheet is linked to it${isCeo ? " or you assigned it by hand" : ""}. Download a team report to see everyone who worked on a project.`}
        actions={<button type="button" className="button button-ghost" onClick={download} disabled={!data}><Download size={14} /> Download CSV</button>}
      />
      <BiFilterBar filters={filters} onChange={setFilters} hide={["project"]} />
      {error && <ErrorNotice message={error} onRetry={load} />}
      {loading && !data && <Loading label="Adding up project travel…" />}

      {data && (
        <div className={`page-stack ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
            <Kpi label="Projects" value={count(data.status_counts.total)}
              detail={`${data.status_counts.active} active · ${data.status_counts.completed} completed · ${data.status_counts.unknown} status not set`} />
            <Kpi label="With travel in this period" value={count(data.projects.filter((p) => p.bookings > 0 && p.kind === "project").length)}
              detail={`plus ${plural(data.projects.filter((p) => p.bookings > 0 && p.kind !== "project").length, "cost centre or event", "cost centres or events")}`} />
            <Kpi label="Travellers on projects" value={count(data.travellers_on_projects)} />
          </div>
          {reportError && <ErrorNotice message={reportError} />}

          <div className="panel table-panel">
            <div className="table-toolbar flex-wrap gap-2">
              <label className="toolbar-filters relative">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-60" aria-hidden />
                <input type="search" className="pl-7" placeholder="Search project, code, client or site" aria-label="Search projects" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
              <label className="toolbar-filters" style={{ flex: "0 0 auto" }}>
                <select value={kind} onChange={(e) => setKind(e.target.value as ProjectKind | "")} aria-label="Type">
                  <option value="">All types</option>
                  {(Object.keys(KIND_LABEL) as ProjectKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
              </label>
              <label className="toolbar-filters" style={{ flex: "0 0 auto" }}>
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by">
                  <option value="spend">Highest spend</option><option value="bookings">Most bookings</option>
                  <option value="travellers">Most travellers</option><option value="latest">Latest travel</option><option value="name">Name</option>
                </select>
              </label>
              <label className="text-xs inline-flex items-center gap-1.5"><input type="checkbox" checked={withTravel} onChange={(e) => setWithTravel(e.target.checked)} /> Only with travel</label>
            </div>
            {rows.length === 0 ? <Empty title="No matching projects" description="Projects appear here once a sheet's project names are linked to them on the upload screen." /> : (
              <div className="responsive-table">
                <table>
                  <thead><tr>
                    <th>Project</th><th>Status</th><th className="text-right">Travellers</th><th className="text-right">Bookings</th>
                    <th className="text-right">Spend</th><th className="text-right">Avg per booking</th><th>Travel</th><th>Trend</th><th>Team report</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.project_id}>
                        <td>
                          <Link href={`/travel/bi/projects/${p.project_id}`} className="font-semibold hover:underline">{p.name}</Link>
                          <div className="table-subline">{[KIND_LABEL[p.kind], p.code, p.client].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td><ProjectStatusPill status={p.status} /></td>
                        <td className="text-right">{count(p.travellers)}</td>
                        <td className="text-right">{count(p.bookings)}{p.without_cost > 0 && <div className="table-subline" title="Bookings with no cost of their own in the sheet">{p.without_cost} without cost</div>}</td>
                        <td className="text-right font-semibold">{formatMoney(p.spend, cur)}</td>
                        <td className="text-right">{p.avg_per_booking == null ? "—" : formatMoney(p.avg_per_booking, cur)}</td>
                        <td className="whitespace-nowrap text-xs">{p.bookings ? dateRange(p.first_date, p.last_date) : "—"}</td>
                        <td style={{ width: 96 }}><Spark data={p.monthly} months={data.months} /></td>
                        <td>
                          <button type="button" className="button button-ghost whitespace-nowrap" onClick={() => void teamReport(p)} disabled={!p.bookings || !!busyId}
                            aria-label={`Download the team report for ${p.name}`} title="Everyone who worked on this project, with their bookings (Excel)">
                            <FileSpreadsheet size={14} /> {busyId === p.project_id ? "Creating…" : "Download"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Spark({ data, months }: { data: { month: string; spend: number }[]; months: string[] }) {
  if (!data.length || months.length < 2) return <span className="opacity-40 text-xs">—</span>;
  const map = new Map(data.map((d) => [d.month, Number(d.spend)]));
  const series = [...months].sort().map((m) => ({ m, v: map.get(m) ?? 0 }));
  return (
    <div style={{ width: 90, height: 28 }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={series} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}><Bar dataKey="v" fill="var(--blue)" radius={[2, 2, 0, 0]} /></BarChart>
      </ResponsiveContainer>
    </div>
  );
}
