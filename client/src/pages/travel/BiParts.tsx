import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { COST_STATE_LABEL, type CostState, type Kpis, type OtherCurrency } from "../../lib/data/bi";
import { formatDate, formatMoney } from "./common";

export const BI_PALETTE = ["var(--saffron)", "var(--blue)", "var(--green)", "#f59e0b", "#a855f7", "#64748b", "#ef4444", "#0ea5e9"];
export const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
export const count = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("en-IN");
export const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;

export function Panel({ title, note, actions, children, className = "" }: { title: string; note?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel p-4 min-w-0 ${className}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <h2 className="section-heading">{title}</h2>
          {note && <p className="text-xs opacity-70 mt-0.5">{note}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** A big number with a short line underneath. */
export function Kpi({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: "warn" | "muted" }) {
  return (
    <div className={`panel bi-kpi ${tone ? `bi-kpi-${tone}` : ""}`}>
      <span className="card-kicker">{label}</span>
      <div className="bi-kpi-value" title={value}>{value}</div>
      {detail && <div className="bi-kpi-detail">{detail}</div>}
    </div>
  );
}

/**
 * How complete the money figures are. Every total on the page is built from
 * "costed" bookings only; this strip says how many were left out and why.
 */
export function DataQuality({ kpis, currency, others }: { kpis: Kpis; currency: string; others: OtherCurrency[] }) {
  const items: { label: string; value: string; hint: string }[] = [
    { label: "With a cost", value: count(kpis.costed_bookings), hint: `Bookings whose ${currency} cost is in the sheet and counted in spend` },
    { label: "No cost in sheet", value: count(kpis.missing_cost), hint: "The cost cell was blank. Not counted as zero." },
    { label: "Shared cost", value: count(kpis.shared_cost), hint: "Covered by one merged cost on another line of the same group (for example a shared hotel room)." },
    { label: "Cancelled", value: count(kpis.cancelled), hint: `Not in spend. Cost recorded on cancelled bookings: ${formatMoney(kpis.cancelled_cost, currency)} (refunds are not in the sheet).` },
  ];
  if (kpis.zero_cost) items.splice(3, 0, { label: "Zero in sheet", value: count(kpis.zero_cost), hint: "The sheet says 0 for these bookings." });
  return (
    <div className="bi-quality" aria-label="How complete the figures are">
      {items.map((i) => (
        <div key={i.label} className="bi-quality-item" title={i.hint}>
          <strong>{i.value}</strong><span>{i.label}</span>
        </div>
      ))}
      {others.length > 0 && (
        <div className="bi-quality-note">
          <Info size={13} aria-hidden />
          <span>
            Also booked in other currencies, shown apart and never added to {currency}:{" "}
            {others.map((o) => `${formatMoney(o.spend, o.currency)} (${plural(o.bookings, "booking")})`).join(", ")}.
          </span>
        </div>
      )}
    </div>
  );
}

/** A booking's cost, saying why it is blank when it is. */
export function CostCell({ amount, currency, state, status }: { amount: number | null; currency: string; state: CostState; status: string }) {
  if (state === "missing" || state === "shared") return <span className="bi-cost-note" title={COST_STATE_LABEL[state]}>{COST_STATE_LABEL[state]}</span>;
  return (
    <span className={status === "cancelled" ? "line-through opacity-60" : ""} title={status === "cancelled" ? "Cancelled: not counted in spend" : undefined}>
      {formatMoney(amount, currency)}
    </span>
  );
}

/** A thin bar showing a share of the largest value in a list. */
export function ShareBar({ value, max, color = "var(--saffron)" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return <span className="bi-sharebar" aria-hidden><span style={{ width: `${pct}%`, background: color }} /></span>;
}

export function dateRange(from: string | null | undefined, to: string | null | undefined): string {
  if (!from) return "No dated bookings";
  return from === to ? formatDate(from) : `${formatDate(from)} to ${formatDate(to)}`;
}
