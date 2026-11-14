import { useCallback, useEffect, useState } from "react";
import { Info } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  WORKFORCE_TYPE_LABELS, getWorkforceAnalytics,
  type AnalyticsFilters, type WorkforceAnalytics, type WorkforceGroup, type WorkforceRegion,
} from "../../lib/data/workforce";
import { Kpi, Panel, count, plural } from "./BiParts";
import { ErrorNotice, Loading, formatMoney } from "./common";

const GROUP_LABEL: Record<WorkforceGroup, string> = { permanent: "Permanent employees", non_permanent: "Temporary, contract & others" };
const REGION_LABEL: Record<WorkforceRegion, string> = { domestic: "Domestic", international: "International", unclassified: "Place not recognised" };
const pct = (v: number | null | undefined) => (v == null ? "—" : `${v}%`);

/**
 * Travel spend by kind of worker, contractor, project, month and region.
 * Every figure comes from the trips and cost lines on file (workforce_analytics).
 */
export default function WorkforceAnalyticsPanel() {
  const [filters, setFilters] = useState<AnalyticsFilters>({});
  const [draft, setDraft] = useState<AnalyticsFilters>({});
  const [data, setData] = useState<WorkforceAnalytics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    getWorkforceAnalytics(filters)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the workforce analytics."))
      .finally(() => setLoading(false));
  }, [filters]);
  useEffect(() => load(), [load]);

  const cur = data?.base_currency ?? "INR";
  const cmp = (g: WorkforceGroup) => data?.comparison.find((c) => c.group === g);
  const region = (g: WorkforceGroup, r: WorkforceRegion) => data?.regions.find((x) => x.group === g && x.region === r);
  const monthly = (data?.monthly ?? []).map((m) => ({ month: m.month, Permanent: Number(m.permanent_net), "Not permanent": Number(m.non_permanent_net) }));

  return (
    <section className="page-stack" aria-labelledby="workforce-analytics-title">
      <div className="table-toolbar flex-wrap gap-2 p-0">
        <h2 id="workforce-analytics-title" className="section-heading">Travel spend analytics</h2>
        <form className="flex flex-wrap gap-2 items-end ml-auto" onSubmit={(e) => { e.preventDefault(); setFilters(draft); }}>
          <label className="field"><span>Travel from</span><input type="date" value={draft.from ?? ""} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} /></label>
          <label className="field"><span>to</span><input type="date" value={draft.to ?? ""} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} /></label>
          <button type="submit" className="button button-ghost">Apply</button>
          {(filters.from || filters.to) && <button type="button" className="button button-ghost" onClick={() => { setDraft({}); setFilters({}); }}>All dates</button>}
        </form>
      </div>

      {error && <ErrorNotice message={error} onRetry={load} />}
      {loading && !data && <Loading label="Adding up workforce travel…" />}
      {data && (
        <div className={`page-stack ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Kpi label="Temporary, contract & others" value={formatMoney(cmp("non_permanent")?.net, cur)} detail={`${pct(cmp("non_permanent")?.share_pct)} of recorded travel spend · ${plural(cmp("non_permanent")?.trips ?? 0, "trip")}`} />
            <Kpi label="Permanent employees" value={formatMoney(cmp("permanent")?.net, cur)} detail={`${pct(cmp("permanent")?.share_pct)} · ${plural(cmp("permanent")?.trips ?? 0, "trip")}`} />
            <Kpi label="Average ticket fare" value={formatMoney(cmp("non_permanent")?.avg_ticket_fare, cur)} detail={`Not permanent; permanent ${formatMoney(cmp("permanent")?.avg_ticket_fare, cur)}. Zero fares and missing costs left out.`} />
            <Kpi label="International (not permanent)" value={formatMoney(region("non_permanent", "international")?.net, cur)}
              detail={`${plural(region("non_permanent", "international")?.trips ?? 0, "trip")} · domestic ${formatMoney(region("non_permanent", "domestic")?.net, cur)}`} />
          </div>

          <div className="bi-quality" aria-label="How complete the figures are">
            <div className="bi-quality-item" title="Cancelled trips are counted here and left out of spend"><strong>{count(data.quality.cancelled_trips)}</strong><span>Cancelled</span></div>
            <div className="bi-quality-item" title="The cost was blank. Not counted as zero."><strong>{count(data.quality.missing_cost_lines)}</strong><span>Costs missing</span></div>
            <div className="bi-quality-item" title="The sheet said 0. Kept, but not in the average fare."><strong>{count(data.quality.zero_fare_lines)}</strong><span>Zero fares</span></div>
            <div className="bi-quality-item" title="A place on the trip could not be found, so it is neither domestic nor international"><strong>{count(data.quality.unclassified_trips)}</strong><span>Place not recognised</span></div>
            <div className="bi-quality-item" title="Trips by people who are not permanent employees, with no project linked"><strong>{count(data.quality.unassigned_project_trips)}</strong><span>No project</span></div>
            {data.other_currencies.length > 0 && (
              <div className="bi-quality-note">
                <Info size={13} aria-hidden />
                <span>Also in other currencies, shown apart and never added to {cur}: {data.other_currencies.map((o) => `${formatMoney(o.net, o.currency)} (${GROUP_LABEL[o.group].toLowerCase()}, ${plural(o.trips, "trip")})`).join(", ")}.</span>
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Monthly travel spend" note={`Net, ${cur}; cancelled trips left out`} className="lg:col-span-2">
              {monthly.length === 0 ? <p className="text-sm opacity-70">No trips in this period.</p> : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={monthly} margin={{ left: 8, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--ink-soft)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--ink-soft)" }} width={70} tickFormatter={(v: number) => formatMoney(v, cur)} />
                    <Tooltip formatter={(v: number) => formatMoney(v, cur)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Not permanent" fill="var(--saffron)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="Permanent" fill="var(--blue)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>
            <Panel title="By quarter" note={`Net, ${cur}`}>
              <table className="bi-table">
                <thead><tr><th>Quarter</th><th className="text-right">Not permanent</th><th className="text-right">Permanent</th></tr></thead>
                <tbody>{data.quarterly.map((q) => <tr key={q.quarter}><td>{q.quarter}</td><td className="text-right">{formatMoney(q.non_permanent_net, cur)}</td><td className="text-right">{formatMoney(q.permanent_net, cur)}</td></tr>)}</tbody>
              </table>
            </Panel>
          </div>

          <Panel title="By kind of worker" note={`Net ${cur}; average fare leaves out zero fares and trips with a missing cost`}>
            <div className="responsive-table">
              <table className="bi-table">
                <thead><tr><th>Kind</th><th className="text-right">People</th><th className="text-right">Travelled</th><th className="text-right">Trips</th><th className="text-right">Gross</th><th className="text-right">Credits</th><th className="text-right">Net</th><th className="text-right">Per traveller</th><th className="text-right">Average fare</th><th className="text-right">Costs missing</th></tr></thead>
                <tbody>{data.by_type.map((k) => (
                  <tr key={k.workforce_type}>
                    <td>{WORKFORCE_TYPE_LABELS[k.workforce_type]}</td>
                    <td className="text-right">{count(k.people)}</td><td className="text-right">{count(k.travellers)}</td>
                    <td className="text-right">{count(k.trips)}{k.cancelled_trips > 0 && <div className="table-subline">{k.cancelled_trips} cancelled</div>}</td>
                    <td className="text-right">{formatMoney(k.gross, cur)}</td><td className="text-right">{Number(k.credits) < 0 ? formatMoney(k.credits, cur) : "—"}</td>
                    <td className="text-right font-semibold">{formatMoney(k.net, cur)}</td>
                    <td className="text-right">{formatMoney(k.avg_net_per_traveller, cur)}</td>
                    <td className="text-right">{formatMoney(k.avg_ticket_fare, cur)}{k.fares_averaged > 0 && <div className="table-subline">{plural(k.fares_averaged, "fare")}</div>}</td>
                    <td className="text-right">{count(k.missing_cost_lines)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="By contractor" note={`People who are not permanent employees · net ${cur}`}>
              {data.contractors.length === 0 ? <p className="text-sm opacity-70">No trips in this period.</p> : (
                <table className="bi-table">
                  <thead><tr><th>Contractor</th><th className="text-right">Workers</th><th className="text-right">Trips</th><th className="text-right">Net</th></tr></thead>
                  <tbody>{data.contractors.map((c) => (
                    <tr key={c.contractor_id ?? "unknown"}>
                      <td>{c.contractor_id ? c.name : <span className="opacity-70">Unknown (no contractor on file)</span>}</td>
                      <td className="text-right">{count(c.travellers)}<div className="table-subline">of {count(c.workers)}</div></td>
                      <td className="text-right">{count(c.trips)}</td>
                      <td className="text-right">{formatMoney(c.net, cur)}{c.missing_cost_lines > 0 && <div className="table-subline">{plural(c.missing_cost_lines, "cost")} missing</div>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </Panel>
            <Panel title="By project" note={`From the project linked to each trip · net ${cur}`}>
              {data.projects.length === 0 ? <p className="text-sm opacity-70">No trips in this period.</p> : (
                <table className="bi-table">
                  <thead><tr><th>Project</th><th className="text-right">Workers</th><th className="text-right">Not permanent</th><th className="text-right">Permanent</th><th className="text-right">Share</th></tr></thead>
                  <tbody>{data.projects.map((p) => (
                    <tr key={p.project_id ?? "unassigned"}>
                      <td>{p.project_id ? p.name : <span className="opacity-70">Unassigned</span>}</td>
                      <td className="text-right">{count(p.non_permanent_workers)}<div className="table-subline">{plural(p.non_permanent_trips, "trip")}</div></td>
                      <td className="text-right">{formatMoney(p.non_permanent_net, cur)}</td>
                      <td className="text-right">{formatMoney(p.permanent_net, cur)}</td>
                      <td className="text-right">{pct(p.non_permanent_share_pct)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </Panel>
          </div>

          <Panel title="Domestic and international" note={`Net ${cur}; a trip is international when any place on it is outside the home country (${data.home_country})`}>
            <table className="bi-table">
              <thead><tr><th>Group</th>{(["domestic", "international", "unclassified"] as WorkforceRegion[]).map((r) => <th key={r} className="text-right">{REGION_LABEL[r]}</th>)}</tr></thead>
              <tbody>{(["non_permanent", "permanent"] as WorkforceGroup[]).map((g) => (
                <tr key={g}>
                  <td>{GROUP_LABEL[g]}</td>
                  {(["domestic", "international", "unclassified"] as WorkforceRegion[]).map((r) => {
                    const x = region(g, r);
                    return <td key={r} className="text-right">{formatMoney(x?.net ?? 0, cur)}<div className="table-subline">{plural(x?.trips ?? 0, "trip")}</div></td>;
                  })}
                </tr>
              ))}</tbody>
            </table>
          </Panel>
        </div>
      )}
    </section>
  );
}
