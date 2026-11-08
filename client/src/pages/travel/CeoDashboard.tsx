import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ClipboardCheck, FileCheck2, FolderKanban, IndianRupee, Receipt, UsersRound } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CATEGORY_LABELS, decideExpense, getCeoDashboard, listExpenses, type CeoDashboard as Dash, type Expense } from "../../lib/data/expenses";
import { presetRange, useLiveRefresh, type RangePreset } from "../../lib/data/reports";
import { getSheetProjectTrips } from "../../lib/data/sheetProjects";
import { listAllRequests, type TravelRequest } from "../../lib/data/travel";
import { groupSheetProjects, type SheetProject } from "../../lib/projectTeamReport";
import { Empty, ErrorNotice, Loading, PageHeader, formatDate, formatMoney, routeLabel } from "./common";
import { useRequestTickets } from "./RequestTickets";

const PRESETS: Array<[Exclude<RangePreset, "custom">, string]> = [
  ["last_12_months", "Last 12 months"],
  ["this_fy", "This financial year"],
  ["last_fy", "Last financial year"],
  ["this_month", "This month"],
];

const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
const TOP_PROJECTS = 10;
const short = (s: string, n = 26) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

type ProjectBar = { name: string; full: string; spend: number; bookings: number; travellers: number; share: number };

/** Hover card for one project bar. */
function ProjectTip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ProjectBar }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="chart-tip">
      <strong>{p.full}</strong>
      <span>{formatMoney(p.spend)} · {p.share}% of project spend</span>
      <span>{p.bookings} booking{p.bookings === 1 ? "" : "s"} · {p.travellers} traveller{p.travellers === 1 ? "" : "s"}</span>
    </div>
  );
}

/** CEO and Admin home: company-wide projects, people, expenses and travel at a glance. */
export default function CeoDashboard({ name, profileId, isCeo = true }: { name: string; profileId: string; isCeo?: boolean }) {
  const [preset, setPreset] = useState<Exclude<RangePreset, "custom">>("last_12_months");
  const [dash, setDash] = useState<Dash | null>(null);
  const [pending, setPending] = useState<Expense[]>([]);
  const [projects, setProjects] = useState<SheetProject[] | null>(null);
  const [requests, setRequests] = useState<TravelRequest[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const range = presetRange(preset);
    try {
      const [d, p, trips, reqs] = await Promise.all([
        getCeoDashboard(range.from, range.to),
        listExpenses({ status: "submitted", limit: 6 }),
        getSheetProjectTrips({ from: range.from, to: range.to }).catch(() => []),
        listAllRequests({ status: "all", limit: 300 }).catch(() => [] as TravelRequest[]),
      ]);
      setDash(d);
      setPending(p.filter((e) => e.employee_id !== profileId).slice(0, 5));
      setProjects(groupSheetProjects(trips));
      setRequests(reqs);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the dashboard.");
    }
  }, [preset, profileId]);
  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(["expenses", "travel_records", "travel_requests"], load);

  const waiting = useMemo(() => requests.filter((r) => r.status === "pending").sort((a, b) => a.departure_date.localeCompare(b.departure_date)), [requests]);
  const approved = useMemo(() => requests.filter((r) => r.status === "approved" || r.status === "booked"), [requests]);
  const { byRequest } = useRequestTickets(approved);
  const needTicket = useMemo(() => approved.filter((r) => !(byRequest[r.id]?.length)).sort((a, b) => a.departure_date.localeCompare(b.departure_date)), [approved, byRequest]);

  const projectTotal = useMemo(() => (projects ?? []).reduce((a, p) => a + p.spend, 0), [projects]);
  const bars: ProjectBar[] = useMemo(() => (projects ?? []).slice(0, TOP_PROJECTS).map((p) => ({
    name: short(p.name), full: p.name, spend: p.spend, bookings: p.bookings, travellers: p.travellers,
    share: projectTotal > 0 ? Math.round((p.spend / projectTotal) * 100) : 0,
  })), [projects, projectTotal]);

  async function approve(e: Expense) {
    setBusy(e.id);
    try {
      await decideExpense(e.id, "approved");
      toast.success(`Approved ${formatMoney(e.amount)} for ${e.employee?.full_name ?? "employee"}`);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not approve.");
    } finally {
      setBusy(null);
    }
  }

  // One tile per job. Details live on the page each tile opens.
  const top = projects?.[0];
  const tiles = dash ? [
    { label: "Total spend", value: formatMoney(Number(dash.expenses.total) + Number(dash.travel.spend)), hint: `Travel ${formatMoney(dash.travel.spend)} · claims ${formatMoney(dash.expenses.total)}`, href: "/travel/bi/finance", icon: <IndianRupee size={16} /> },
    { label: "Projects", value: String(projects?.length ?? 0), hint: top ? `Most spent: ${top.name}` : "From the uploaded sheets", href: "/travel/bi/projects", icon: <FolderKanban size={16} /> },
    { label: "Requests waiting", value: String(dash.pending_travel_requests), hint: "Sent to you and the " + (isCeo ? "Admin" : "CEO"), href: "/travel/approvals", icon: <ClipboardCheck size={16} /> },
    { label: "Tickets to upload", value: String(needTicket.length), hint: `${approved.length} approved trip${approved.length === 1 ? "" : "s"}`, href: "/travel/approvals", icon: <FileCheck2 size={16} /> },
    { label: "Claims to review", value: String(dash.expenses.submitted_count), hint: `${formatMoney(dash.expenses.submitted_amount)} waiting`, href: "/travel/expenses/all", icon: <Receipt size={16} /> },
    { label: "Employees", value: String(dash.people.active), hint: `${dash.travel.travellers} travelled · ${dash.travel.trips} trips`, href: "/travel/people", icon: <UsersRound size={16} /> },
  ] : [];

  return (
    <div className="page-stack animate-page">
      <PageHeader
        eyebrow={isCeo ? "CEO DASHBOARD" : "ADMIN DASHBOARD"}
        title={`Good to see you, ${name.split(" ")[0] || (isCeo ? "CEO" : "Admin")}`}
        description="Project spend, travel requests, tickets and claims across the company. Updates by itself."
        actions={
          <select aria-label="Date range" value={preset} onChange={(e) => setPreset(e.target.value as typeof preset)} className="button button-ghost">
            {PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        }
      />
      {error && <ErrorNotice message={error} onRetry={load} />}
      {!dash && !error ? <Loading /> : dash && (
        <>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            {tiles.map((t) => (
              <Link key={t.label} href={t.href} className="panel p-4 min-w-0 hover:shadow-md transition-shadow block">
                <span className="card-kicker flex items-center gap-1">{t.icon} {t.label}</span>
                <div className="text-2xl font-bold mt-1 truncate" title={t.value}>{t.value}</div>
                <div className="text-xs opacity-70 mt-1 truncate">{t.hint}</div>
              </Link>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <section className="panel p-4 lg:col-span-2 min-w-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="card-kicker">Spend by project</span>
                <span className="text-xs opacity-60">{projects?.length ? `${formatMoney(projectTotal)} across ${projects.length} project${projects.length === 1 ? "" : "s"}` : ""}</span>
                <Link href="/travel/bi/projects" className="text-xs underline ml-auto">All projects</Link>
              </div>
              {projects === null ? <Loading /> : bars.length === 0 ? (
                <Empty title="No project spend yet" description="Upload the travel Excel with a Project column. Each project name in the sheet shows here with what was spent on it." />
              ) : (
                <>
                  <div role="img" aria-label={`Spend by project. ${bars.map((b) => `${b.full}: ${formatMoney(b.spend)}`).join("; ")}`}>
                    <ResponsiveContainer width="100%" height={Math.max(160, bars.length * 34 + 24)}>
                      <BarChart data={bars} layout="vertical" margin={{ left: 4, right: 64, top: 4, bottom: 4 }} barCategoryGap={6}>
                        <CartesianGrid horizontal={false} strokeDasharray="2 4" opacity={0.35} />
                        <XAxis type="number" fontSize={11} tickFormatter={(v) => compact.format(Number(v))} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" width={170} fontSize={11.5} axisLine={false} tickLine={false} />
                        <Tooltip content={<ProjectTip />} cursor={{ fill: "rgba(242,169,59,0.08)" }} />
                        <Bar dataKey="spend" name="Spend" radius={[0, 4, 4, 0]} maxBarSize={22}>
                          {bars.map((b, i) => <Cell key={b.full} fill={i === 0 ? "#F2A93B" : "#1BA39C"} />)}
                          <LabelList dataKey="spend" position="right" formatter={(v: unknown) => compact.format(Number(v))} className="chart-value-label" fontSize={11} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {(projects?.length ?? 0) > TOP_PROJECTS && <p className="text-xs opacity-60">Showing the {TOP_PROJECTS} projects with the most spend. <Link href="/travel/bi/projects" className="underline">See all {projects?.length}</Link></p>}
                </>
              )}
            </section>
            <section className="panel p-4 min-w-0">
              <div className="flex items-center justify-between"><span className="card-kicker">Travel requests to decide</span><Link href="/travel/approvals" className="text-xs underline">Open</Link></div>
              {waiting.length === 0 ? <p className="text-sm opacity-70 mt-3">No requests waiting.</p> : (
                <ul className="mt-2 space-y-2">
                  {waiting.slice(0, 6).map((r) => (
                    <li key={r.id} className="text-sm">
                      <Link href="/travel/approvals" className="block min-w-0 hover:underline">
                        <div className="font-semibold truncate">{r.employee?.full_name ?? "Employee"} · {routeLabel(r.origin, r.destination)}</div>
                        <div className="text-xs opacity-70 truncate">{formatDate(r.departure_date)}{r.project_name ? ` · ${r.project_name}` : ""} · {r.purpose}</div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <section className="panel p-4 min-w-0">
              <div className="flex items-center justify-between"><span className="card-kicker">Approved trips: ticket to upload</span><Link href="/travel/approvals" className="text-xs underline">Upload tickets</Link></div>
              {needTicket.length === 0 ? <p className="text-sm opacity-70 mt-3">Every approved trip has its ticket.</p> : (
                <ul className="mt-2 space-y-2">
                  {needTicket.slice(0, 5).map((r) => (
                    <li key={r.id} className="text-sm">
                      <Link href="/travel/approvals" className="block min-w-0 hover:underline">
                        <div className="font-semibold truncate">{r.employee?.full_name ?? "Employee"} · {routeLabel(r.origin, r.destination)}</div>
                        <div className="text-xs opacity-70 truncate">Travels {formatDate(r.departure_date)}{r.decided_by_name ? ` · approved by ${r.decided_by_name}` : ""}</div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="panel p-4 min-w-0">
              <div className="flex items-center justify-between"><span className="card-kicker">Claims to review</span><Link href="/travel/expenses/all" className="text-xs underline">See all</Link></div>
              {pending.length === 0 ? <p className="text-sm opacity-70 mt-3">Nothing waiting. Nice.</p> : (
                <ul className="mt-2 space-y-2">
                  {pending.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate">{e.employee?.full_name} · {formatMoney(e.amount, e.currency)}</div>
                        <div className="text-xs opacity-70 truncate">{CATEGORY_LABELS[e.category]} · {formatDate(e.expense_date)} · {e.description}</div>
                      </div>
                      <button type="button" className="button button-ghost" disabled={busy === e.id} onClick={() => approve(e)} aria-label={`Approve ${e.description}`}><Check size={14} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="grid gap-3">
            <section className="panel p-4 min-w-0">
              <div className="flex items-center justify-between"><span className="card-kicker">Top spenders</span><Link href="/travel/employees" className="text-xs underline">All employees</Link></div>
              {dash.top_spenders.length === 0 ? <p className="text-sm opacity-70 mt-3">No spend in this period.</p> : (
                <div className="responsive-table mt-2">
                  <table>
                    <thead><tr><th>Employee</th><th className="text-right">Travel</th><th className="text-right">Total</th></tr></thead>
                    <tbody>
                      {dash.top_spenders.map((s) => (
                        <tr key={s.employee_id}>
                          <td><Link href={`/travel/employees/${s.employee_id}`} className="font-semibold hover:underline">{s.full_name}</Link><div className="table-subline">{s.department ?? s.employee_code}</div></td>
                          <td className="text-right">{formatMoney(s.travel)}</td>
                          <td className="text-right font-semibold">{formatMoney(s.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="panel p-4 min-w-0">
              <span className="card-kicker">Departments</span>
              {dash.by_department.length === 0 ? <p className="text-sm opacity-70 mt-3">No departments yet.</p> : (
                <div className="responsive-table mt-2">
                  <table>
                    <thead><tr><th>Department</th><th className="text-right">People</th><th className="text-right">Expenses</th><th className="text-right">Travel</th></tr></thead>
                    <tbody>
                      {dash.by_department.map((d) => (
                        <tr key={d.department}>
                          <td className="font-semibold">{d.department}</td>
                          <td className="text-right">{d.people}</td>
                          <td className="text-right">{formatMoney(d.expenses)}</td>
                          <td className="text-right">{formatMoney(d.travel)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
