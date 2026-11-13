import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, FileSpreadsheet, FileText, Search } from "lucide-react";
import { Link } from "wouter";
import { STATUS_LABEL, useBiFilters, type ProjectStatus } from "../../lib/data/bi";
import { getSheetProjectTrips } from "../../lib/data/sheetProjects";
import { recordReportGenerated } from "../../lib/data/travel";
import { groupSheetProjects, projectHref, type SheetProject, type SheetTrip } from "../../lib/projectTeamReport";
import { exportToCsv } from "../../utils/exportCsv";
import BiFilterBar from "./BiFilterBar";
import { downloadTeamReport } from "./BiProjectDetail";
import { Kpi, count, dateRange } from "./BiParts";
import { Empty, ErrorNotice, Loading, PageHeader, formatMoney } from "./common";

const STATUS_TONE: Record<ProjectStatus, string> = { active: "approved", completed: "completed", on_hold: "pending-approval", unknown: "booked" };
export function ProjectStatusPill({ status }: { status: ProjectStatus }) {
  return <span className={`status-badge status-${STATUS_TONE[status]}`}><span className="status-dot" />{STATUS_LABEL[status]}</span>;
}

type Sort = "spend" | "bookings" | "travellers" | "name" | "latest";

/**
 * Project Intelligence: every project name from the uploaded Excel sheets,
 * the employees who travelled under it, and a report to download.
 */
export default function BiProjects({ isCeo: _isCeo }: { isCeo: boolean }) {
  const [filters, setFilters] = useBiFilters();
  const [trips, setTrips] = useState<SheetTrip[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("spend");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    getSheetProjectTrips(filters)
      .then(setTrips)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the projects."))
      .finally(() => setLoading(false));
  }, [filters]);
  useEffect(() => load(), [load]);

  const cur = "INR";
  const projects = useMemo(() => groupSheetProjects(trips ?? [], cur), [trips]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = projects.filter((p) => !q || p.spellings.some((s) => s.toLowerCase().includes(q))
      || p.detail.employees.some((e) => `${e.full_name} ${e.employee_code}`.toLowerCase().includes(q)));
    const by: Record<Sort, (a: SheetProject, b: SheetProject) => number> = {
      spend: (a, b) => b.spend - a.spend || b.bookings - a.bookings,
      bookings: (a, b) => b.bookings - a.bookings,
      travellers: (a, b) => b.travellers - a.travellers,
      name: (a, b) => a.name.localeCompare(b.name),
      latest: (a, b) => (b.last_date ?? "").localeCompare(a.last_date ?? ""),
    };
    return [...list].sort(by[sort]);
  }, [projects, query, sort]);
  // With a search that matches one project, open it straight away.
  useEffect(() => { if (query.trim() && rows.length === 1) setOpen(rows[0].key); }, [query, rows]);

  const people = useMemo(() => new Set(projects.flatMap((p) => p.detail.employees.map((e) => e.employee_id))).size, [projects]);

  async function report(p: SheetProject, format: "xlsx" | "pdf") {
    setBusy(`${p.key}|${format}`);
    setError("");
    try {
      await downloadTeamReport(p.detail, p.name, filters, format);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the report.");
    } finally {
      setBusy("");
    }
  }

  function downloadList() {
    exportToCsv("project_intelligence",
      ["Project", "Employees", "Bookings", `Spend (${cur})`, "Bookings without a cost", "First travel", "Last travel", "Employee names"],
      rows.map((p) => [p.name, p.travellers, p.bookings, p.spend, p.detail.kpis.missing_cost, p.first_date ?? "", p.last_date ?? "",
        p.detail.employees.map((e) => e.full_name).join("; ")]));
    void recordReportGenerated("project_intelligence").catch(() => undefined);
  }

  return (
    <div className="page-stack animate-page">
      <PageHeader
        eyebrow="BUSINESS INTELLIGENCE"
        title="Project Intelligence"
        description="Every project from the project column of the uploaded Excel sheets. Click a project name for its full details, or the arrow to see its team here."
        actions={<button type="button" className="button button-ghost" onClick={downloadList} disabled={!rows.length}><Download size={14} /> Download list (CSV)</button>}
      />
      <BiFilterBar filters={filters} onChange={setFilters} hide={["project"]} />
      {error && <ErrorNotice message={error} onRetry={load} />}
      {loading && !trips && <Loading label="Reading the projects from the sheets…" />}

      {trips && (
        <div className={`page-stack ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
            <Kpi label="Projects" value={count(projects.length)} detail="Project names found in the sheets" />
            <Kpi label="Employees on projects" value={count(people)} />
            <Kpi label="Bookings" value={count(projects.reduce((s, p) => s + p.bookings, 0))} />
          </div>

          <div className="panel table-panel">
            <div className="table-toolbar flex-wrap gap-2">
              <label className="toolbar-filters relative">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-60" aria-hidden />
                <input type="search" className="pl-7" placeholder="Search a project (as in the Excel) or an employee" aria-label="Search projects" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
              <label className="toolbar-filters" style={{ flex: "0 0 auto" }}>
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by">
                  <option value="spend">Highest spend</option><option value="bookings">Most bookings</option>
                  <option value="travellers">Most employees</option><option value="latest">Latest travel</option><option value="name">Name</option>
                </select>
              </label>
            </div>
            {rows.length === 0 ? (
              <Empty title={projects.length ? "No matching projects" : "No projects yet"}
                description={projects.length ? "Try another project name or employee." : "Projects come from the project column of uploaded travel sheets. Upload a sheet with a project name on each booking, or clear the filters."} />
            ) : (
              <div className="responsive-table">
                <table>
                  <thead><tr>
                    <th>Project</th><th className="text-right">Employees</th><th className="text-right">Bookings</th>
                    <th className="text-right">Spend</th><th>Travel</th><th>Report</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((p) => {
                      const isOpen = open === p.key;
                      return (
                        <Fragment key={p.key}>
                          <tr>
                            <td>
                              <span className="inline-flex items-center gap-1">
                                <button type="button" className="icon-button" style={{ width: 22, height: 22 }} aria-expanded={isOpen}
                                  aria-label={isOpen ? `Hide the team of ${p.name}` : `Show the team of ${p.name}`} onClick={() => setOpen(isOpen ? null : p.key)}>
                                  {isOpen ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                                </button>
                                <Link href={projectHref(p.name) ?? "/travel/bi/projects"} className="font-semibold hover:underline text-left">{p.name}</Link>
                              </span>
                              {p.spellings.length > 1 && <div className="table-subline">Also written as: {p.spellings.slice(1, 4).join(", ")}{p.spellings.length > 4 ? "…" : ""}</div>}
                            </td>
                            <td className="text-right">{count(p.travellers)}</td>
                            <td className="text-right">{count(p.bookings)}{p.detail.kpis.missing_cost > 0 && <div className="table-subline">{p.detail.kpis.missing_cost} without cost</div>}</td>
                            <td className="text-right font-semibold">{formatMoney(p.spend, cur)}</td>
                            <td className="whitespace-nowrap text-xs">{dateRange(p.first_date, p.last_date)}</td>
                            <td className="whitespace-nowrap">
                              <button type="button" className="button button-ghost" onClick={() => void report(p, "xlsx")} disabled={!!busy}
                                aria-label={`Download the Excel report for ${p.name}`}><FileSpreadsheet size={14} /> {busy === `${p.key}|xlsx` ? "Creating…" : "Excel"}</button>
                              <button type="button" className="button button-ghost" onClick={() => void report(p, "pdf")} disabled={!!busy}
                                aria-label={`Download the PDF report for ${p.name}`}><FileText size={14} /> {busy === `${p.key}|pdf` ? "Creating…" : "PDF"}</button>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr>
                              <td colSpan={6} style={{ background: "var(--surface-soft, transparent)" }}>
                                <h3 className="card-kicker mb-2">Employees who worked under {p.name}</h3>
                                <table className="bi-table">
                                  <thead><tr><th>Employee</th><th>Employee ID</th><th>Department</th><th className="text-right">Bookings</th><th className="text-right">Spend</th><th>Travel</th></tr></thead>
                                  <tbody>
                                    {p.detail.employees.map((e) => (
                                      <tr key={e.employee_id}>
                                        <td><Link href={`/travel/employees/${e.employee_id}`} className="font-semibold hover:underline">{e.full_name}</Link></td>
                                        <td>{e.employee_code || "—"}</td>
                                        <td>{e.department}</td>
                                        <td className="text-right">{e.bookings}{e.without_cost > 0 && <div className="table-subline">{e.without_cost} without cost</div>}</td>
                                        <td className="text-right">{formatMoney(e.spend, cur)}</td>
                                        <td className="text-xs whitespace-nowrap">{dateRange(e.first_date, e.last_date)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
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
