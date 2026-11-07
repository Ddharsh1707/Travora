import { useCallback, useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LINE_TYPE_LABEL, getFinance, periodLabel, useBiFilters, type FinanceReport, type Period } from "../../lib/data/bi";
import { recordReportGenerated } from "../../lib/data/travel";
import { exportToCsv } from "../../utils/exportCsv";
import BiFilterBar from "./BiFilterBar";
import { DataQuality, Kpi, Panel, ShareBar, compact, count, plural } from "./BiParts";
import { Empty, ErrorNotice, Loading, PageHeader, formatMoney, labelFor } from "./common";

const CATEGORY_COLOR: Record<string, string> = {
  flight: "var(--saffron)", hotel: "var(--blue)", train: "var(--green)", bus: "#f59e0b", cab: "#a855f7", multi_modal: "#0ea5e9", other: "#64748b",
};

/** Adds the months with no travel, so the chart's spacing matches the calendar. */
type ChartRow = { period: string; label: string } & Record<string, string | number>;
function fillMonths(rows: ChartRow[]): ChartRow[] {
  if (rows.length < 2) return rows;
  const by = new Map(rows.map((r) => [r.period, r]));
  const sorted = rows.map((r) => r.period).sort();
  const out: ChartRow[] = [];
  let [y, m] = sorted[0].split("-").map(Number);
  for (let i = 0; i < 61; i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push(by.get(key) ?? { period: key, label: periodLabel(key) });
    if (key >= sorted[sorted.length - 1]) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

const PERIODS: { id: Period; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "quarter", label: "Quarter" },
  { id: "fy", label: "Financial year" },
];

/**
 * Financial Intelligence. Every total is traceable: spend = bookings that were
 * not cancelled, in the base currency; missing, shared, zero and cancelled
 * costs are shown on their own; other currencies are never added in.
 */
export default function BiFinance() {
  const [filters, setFilters] = useBiFilters();
  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<FinanceReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    getFinance(filters, period)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load Financial Intelligence."))
      .finally(() => setLoading(false));
  }, [filters, period]);
  useEffect(() => load(), [load]);

  const cur = data?.base_currency ?? "INR";
  const categories = useMemo(() => Array.from(new Set((data?.periods ?? []).flatMap((p) => Object.keys(p.by_category ?? {})))).sort(), [data]);
  const chart = useMemo(() => {
    const rows: ChartRow[] = (data?.periods ?? []).map((p) => ({ period: p.period, label: periodLabel(p.period), ...(p.by_category ?? {}) }));
    return data?.period === "month" ? fillMonths(rows) : rows;
  }, [data]);
  const chargesTotal = (data?.charges ?? []).reduce((s, c) => s + Number(c.amount), 0);
  const vendorMax = Math.max(0, ...(data?.vendors ?? []).map((v) => Number(v.spend)));

  function download() {
    if (!data) return;
    exportToCsv(`financial_intelligence_${period}`,
      ["Period", "Bookings", `Spend (${cur})`, `Cancelled cost (${cur})`, "Bookings without a cost", ...categories.map((c) => `${labelFor(c)} (${cur})`)],
      data.periods.map((p) => [p.period, p.bookings, p.spend, p.cancelled_cost, p.without_cost, ...categories.map((c) => p.by_category?.[c] ?? 0)]));
    void recordReportGenerated("financial_intelligence").catch(() => undefined);
  }

  const k = data?.kpis;
  return (
    <div className="page-stack animate-page">
      <PageHeader
        eyebrow="BUSINESS INTELLIGENCE"
        title="Financial Intelligence"
        description={`Travel cost by period, vendor and type, in ${cur}. Periods follow the travel date; the financial year runs 1 April to 31 March.`}
        actions={<button type="button" className="button button-ghost" onClick={download} disabled={!data?.periods.length}><Download size={14} /> Download CSV</button>}
      />
      <BiFilterBar filters={filters} onChange={setFilters} />
      {error && <ErrorNotice message={error} onRetry={load} />}
      {loading && !data && <Loading label="Adding up costs…" />}

      {data && k && (k.bookings === 0 && data.other_currencies.length === 0 ? <Empty title="No bookings match" description="Clear some filters." /> : (
        <div className={`page-stack ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Kpi label="Travel spend" value={formatMoney(k.spend, cur)} detail={`${plural(k.costed, "booking")} with a cost`} />
            <Kpi label="Average per booking" value={k.avg_cost == null ? "—" : formatMoney(k.avg_cost, cur)} detail="Costed bookings only" />
            <Kpi label="Cancelled cost" value={formatMoney(k.cancelled_cost, cur)} detail={`${plural(k.cancelled, "booking")}; refunds are not in the sheets`} tone={k.cancelled ? "warn" : undefined} />
            <Kpi label="Without a cost" value={count(k.missing_cost + k.shared_cost)} detail={`${k.missing_cost} blank in the sheet · ${k.shared_cost} shared with another line`} tone={k.missing_cost ? "warn" : undefined} />
          </div>
          <DataQuality kpis={{ ...k, costed_bookings: k.costed, first_date: null, last_date: null, travellers: 0 }} currency={cur} others={data.other_currencies} />

          <Panel title={`Spend by ${PERIODS.find((p) => p.id === period)?.label.toLowerCase()}`} note="Stacked by travel type"
            actions={(
              <div className="bi-seg" role="group" aria-label="Period">
                {PERIODS.map((p) => <button key={p.id} type="button" className={period === p.id ? "on" : ""} aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>{p.label}</button>)}
              </div>
            )}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chart} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--ink-soft)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--ink-soft)" }} tickFormatter={(v: number) => compact.format(v)} width={48} />
                <Tooltip formatter={(v: number, name: string) => [formatMoney(v, cur), labelFor(name)]} />
                <Legend formatter={(v: string) => labelFor(v)} wrapperStyle={{ fontSize: 11 }} />
                {categories.map((c) => <Bar key={c} dataKey={c} stackId="s" fill={CATEGORY_COLOR[c] ?? "#64748b"} maxBarSize={64} />)}
              </BarChart>
            </ResponsiveContainer>
            <div className="bi-scroll mt-2">
              <table className="bi-table">
                <thead><tr><th>Period</th><th className="text-right">Bookings</th><th className="text-right">Spend</th><th className="text-right">Cancelled cost</th><th className="text-right">Without a cost</th></tr></thead>
                <tbody>{data.periods.map((p) => <tr key={p.period}><td>{periodLabel(p.period)}</td><td className="text-right">{count(p.bookings)}</td><td className="text-right font-semibold">{formatMoney(p.spend, cur)}</td><td className="text-right">{formatMoney(p.cancelled_cost, cur)}</td><td className="text-right">{count(p.without_cost)}</td></tr>)}</tbody>
              </table>
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Vendors" note="Airlines, hotels and travel operators as written in the sheets">
              <div className="bi-scroll">
                <table className="bi-table">
                  <thead><tr><th>Vendor</th><th className="text-right">Bookings</th><th className="text-right">Avg cost</th><th className="text-right">Spend</th></tr></thead>
                  <tbody>
                    {data.vendors.map((v) => (
                      <tr key={`${v.provider}-${v.category}`}>
                        <td>{v.provider}<div className="table-subline">{labelFor(v.category)}</div><ShareBar value={Number(v.spend)} max={vendorMax} /></td>
                        <td className="text-right">{count(v.bookings)}</td>
                        <td className="text-right">{v.avg_cost == null ? "—" : formatMoney(v.avg_cost, cur)}</td>
                        <td className="text-right">{formatMoney(v.spend, cur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
            <div className="grid gap-4">
              <Panel title="What the spend is made of" note={`From the individual charges on each booking. They add up to the spend: ${formatMoney(chargesTotal, cur)}.`}>
                <table className="bi-table">
                  <tbody>{data.charges.map((c) => <tr key={c.line_type}><td>{LINE_TYPE_LABEL[c.line_type] ?? c.line_type}<div className="table-subline">{plural(c.lines, "charge")}</div></td><td className="text-right">{formatMoney(c.amount, cur)}</td></tr>)}</tbody>
                </table>
              </Panel>
              <Panel title="Payment mode" note="As written in the sheets">
                <table className="bi-table">
                  <tbody>{data.payment_modes.map((p) => <tr key={p.payment_mode}><td>{p.payment_mode}</td><td className="text-right">{plural(p.bookings, "booking")}</td><td className="text-right">{formatMoney(p.spend, cur)}</td></tr>)}</tbody>
                </table>
              </Panel>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="How far ahead flights were booked" note="Flights with a booking date and a cost. Routes differ between groups, so compare with care.">
              {data.advance.length === 0 ? <p className="text-sm opacity-70">No flights have both a booking date and a cost.</p> : (
                <table className="bi-table">
                  <thead><tr><th>Booked</th><th className="text-right">Flights</th><th className="text-right">Average cost</th></tr></thead>
                  <tbody>{data.advance.map((a) => <tr key={a.bucket}><td>{a.bucket} before travel</td><td className="text-right">{count(a.bookings)}</td><td className="text-right">{a.avg_cost == null ? "—" : formatMoney(a.avg_cost, cur)}</td></tr>)}</tbody>
                </table>
              )}
            </Panel>
            <Panel title="Cost completeness" note="How many bookings in each sheet have a cost of their own">
              <div className="bi-scroll">
                <table className="bi-table">
                  <thead><tr><th>Sheet</th><th className="text-right">Bookings</th><th className="text-right">With cost</th><th className="text-right">Shared</th><th className="text-right">Blank</th><th className="text-right">Cancelled</th></tr></thead>
                  <tbody>{data.completeness.map((c) => (
                    <tr key={`${c.source}-${c.category}`}>
                      <td>{c.source}<div className="table-subline">{labelFor(c.category)}</div></td>
                      <td className="text-right">{count(c.bookings)}</td><td className="text-right">{count(c.recorded + c.zero)}</td>
                      <td className="text-right">{count(c.shared)}</td><td className={`text-right ${c.missing ? "text-amber-700 font-semibold" : ""}`}>{count(c.missing)}</td><td className="text-right">{count(c.cancelled)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </Panel>
          </div>
        </div>
      ))}
    </div>
  );
}
