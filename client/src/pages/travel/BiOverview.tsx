import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "wouter";
import { fillMonthGaps, getOverview, useBiFilters, type Overview } from "../../lib/data/bi";
import { monthLabel } from "../../lib/data/reports";
import BiFilterBar from "./BiFilterBar";
import BiInsights from "./BiInsights";
import { BI_PALETTE, CostCell, DataQuality, Kpi, Panel, ShareBar, compact, count, dateRange, plural } from "./BiParts";
import { Empty, ErrorNotice, Loading, PageHeader, formatDate, formatMoney, labelFor, routeLabel } from "./common";

/**
 * Management overview: one screen of company travel built only from recorded
 * bookings. Approvers see the same page limited to their team (the database
 * applies that), the travel desk and CEO see everyone.
 */
export default function BiOverview({ scopeLabel }: { scopeLabel: string }) {
  const [filters, setFilters] = useBiFilters();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    getOverview(filters)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the overview."))
      .finally(() => setLoading(false));
  }, [filters]);
  useEffect(() => load(), [load]);

  const months = useMemo(() => fillMonthGaps(data?.monthly ?? []).map((m) => ({ ...m, label: monthLabel(m.month) })), [data]);
  const cur = data?.base_currency ?? "INR";
  const k = data?.kpis;

  return (
    <div className="page-stack animate-page">
      <PageHeader
        eyebrow="BUSINESS INTELLIGENCE"
        title="Management overview"
        description={`Travel for ${scopeLabel}, from the bookings recorded in Trapple. Spend counts ${cur} bookings that were not cancelled.`}
      />
      <BiFilterBar filters={filters} onChange={setFilters} />

      {error && <ErrorNotice message={error} onRetry={load} />}
      {loading && !data && <Loading label="Adding up the bookings…" />}

      {data && k && (k.bookings === 0 ? (
        <Empty title="No bookings match" description="Upload a travel sheet, or clear some filters." />
      ) : (
        <div className={`page-stack ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Kpi label="Travel spend" value={formatMoney(k.spend, cur)} detail={`${plural(k.costed_bookings, "booking")} with a cost in ${cur}`} />
            <Kpi label="Bookings" value={count(k.bookings)} detail={dateRange(k.first_date, k.last_date)} />
            <Kpi label="Travellers" value={count(k.travellers)} detail={k.costed_bookings ? `${formatMoney(k.spend / k.costed_bookings, cur)} per costed booking` : undefined} />
            <Kpi
              label="Projects with travel"
              value={count(k.projects_with_travel)}
              detail={k.unassigned_bookings ? `${plural(k.unassigned_bookings ?? 0, "booking")} not linked to a project` : "Every booking is linked to a project"}
              tone={k.unassigned_bookings ? "warn" : undefined}
            />
          </div>

          <DataQuality kpis={k} currency={cur} others={data.other_currencies} />

          <BiInsights filters={filters} />

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Spend and bookings by month" note={`Spend in ${cur} (bars), bookings (line)`} className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={months} margin={{ left: 0, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--ink-soft)" }} interval="preserveStartEnd" />
                  <YAxis yAxisId="s" tick={{ fontSize: 11, fill: "var(--ink-soft)" }} tickFormatter={(v: number) => compact.format(v)} width={48} />
                  <YAxis yAxisId="b" orientation="right" tick={{ fontSize: 11, fill: "var(--ink-soft)" }} width={32} allowDecimals={false} />
                  <Tooltip formatter={(v: number, name: string) => (name === "Spend" ? formatMoney(v, cur) : count(v))} />
                  <Bar yAxisId="s" dataKey="spend" name="Spend" fill="var(--saffron)" radius={[4, 4, 0, 0]} maxBarSize={56} />
                  <Line yAxisId="b" dataKey="bookings" name="Bookings" stroke="var(--blue)" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </Panel>
            <Panel title="By travel type">
              <ul className="grid gap-3 mt-2">
                {data.categories.map((c, i) => (
                  <li key={c.category} className="text-sm">
                    <div className="flex justify-between gap-2"><span>{labelFor(c.category)} <span className="opacity-60">· {plural(c.bookings, "booking")}</span></span><strong>{formatMoney(c.spend, cur)}</strong></div>
                    <ShareBar value={Number(c.spend)} max={Number(data.categories[0]?.spend ?? 0)} color={BI_PALETTE[i % BI_PALETTE.length]} />
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="Top projects by spend"
              actions={<Link href="/travel/bi/projects" className="text-link">All projects <ArrowRight size={12} /></Link>}
            >
              <ResponsiveContainer width="100%" height={Math.max(180, data.top_projects.length * 36)}>
                <BarChart data={data.top_projects} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11, fill: "var(--ink-soft)" }} />
                  <Tooltip formatter={(v: number) => formatMoney(v, cur)} />
                  <Bar dataKey="spend" name="Spend" radius={[0, 4, 4, 0]}>
                    {data.top_projects.map((p) => <Cell key={p.project_id ?? "none"} fill={p.project_id ? "var(--blue)" : "#94a3b8"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs opacity-70">Grey is travel not linked to any project.</p>
            </Panel>
            <Panel title="By department">
              <table className="bi-table">
                <thead><tr><th>Department</th><th className="text-right">Travellers</th><th className="text-right">Bookings</th><th className="text-right">Spend</th></tr></thead>
                <tbody>
                  {data.departments.map((d) => (
                    <tr key={d.department}><td>{d.department}</td><td className="text-right">{count(d.travellers)}</td><td className="text-right">{count(d.bookings)}</td><td className="text-right">{formatMoney(d.spend, cur)}</td></tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Most visited places" note="By number of bookings to that destination">
              <table className="bi-table">
                <thead><tr><th>Place</th><th className="text-right">Bookings</th><th className="text-right">Travellers</th><th className="text-right">Spend</th></tr></thead>
                <tbody>
                  {data.destinations.map((d) => (
                    <tr key={d.destination}>
                      <td><button type="button" className="bi-linkish" onClick={() => setFilters({ ...filters, destination: d.destination })}>{d.destination}</button></td>
                      <td className="text-right">{count(d.bookings)}</td><td className="text-right">{count(d.travellers)}</td><td className="text-right">{formatMoney(d.spend, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <Panel title="Latest travel" actions={<Link href="/travel/search" className="text-link">Search trips <ArrowRight size={12} /></Link>}>
              <table className="bi-table">
                <thead><tr><th>Date</th><th>Traveller</th><th>Trip</th><th className="text-right">Cost</th></tr></thead>
                <tbody>
                  {data.recent.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">{formatDate(r.departure_date)}</td>
                      <td><Link href={`/travel/employees/${r.employee_id}`} className="hover:underline">{r.full_name}</Link>
                        <div className="table-subline">{r.project_name ?? (r.project_raw ? `“${r.project_raw}” (not linked)` : "No project")}</div></td>
                      <td>{routeLabel(r.origin, r.destination)}<div className="table-subline">{labelFor(r.category)}{r.status === "cancelled" ? " · cancelled" : ""}</div></td>
                      <td className="text-right"><CostCell amount={r.amount} currency={r.currency} state={r.cost_state} status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>
        </div>
      ))}
    </div>
  );
}
