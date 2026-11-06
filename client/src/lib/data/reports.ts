import { useEffect, useRef } from "react";
import { getSupabase } from "../supabase";
import { friendlyError } from "./travel";

/**
 * Reports and dashboard numbers. Both database functions run with the
 * caller's permissions, so every figure only covers trips the user may see.
 */

export type TravelReport = {
  range: { from: string; to: string };
  totals: { trips: number; travellers: number; spend: number; trips_without_cost: number; currencies: string[]; upcoming: number };
  by_month: Array<{ month: string; trips: number; spend: number; travellers: number }>;
  by_department: Array<{ department: string; trips: number; spend: number; travellers: number }>;
  by_mode: Array<{ mode: string; trips: number; spend: number }>;
  by_source: Array<{ source: string; trips: number }>;
  top_routes: Array<{ origin: string; destination: string; trips: number; spend: number }>;
  top_travellers: Array<{ employee_id: string; employee_code: string; full_name: string; department: string; trips: number; spend: number }>;
  top_providers: Array<{ provider: string; trips: number; spend: number }>;
};

export type DashboardCounts = {
  my_upcoming_trips: number;
  my_next_trip: { id: string; origin: string; destination: string; departure_date: string; booking_type: string } | null;
  my_pending_requests: number;
  approvals_waiting: number;
  requests_to_book: number | null;
  documents_to_review: number | null;
  bulk_awaiting_review: number;
  trips_next_7_days: number;
};

export type DateRange = { from: string; to: string };
export type RangePreset = "this_fy" | "last_fy" | "last_12_months" | "this_month" | "custom";

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Indian financial year: 1 April to 31 March. */
export function presetRange(preset: Exclude<RangePreset, "custom">, today: Date = new Date()): DateRange {
  const y = today.getFullYear();
  const fyStart = today.getMonth() >= 3 ? y : y - 1;
  switch (preset) {
    case "this_fy":
      return { from: `${fyStart}-04-01`, to: `${fyStart + 1}-03-31` };
    case "last_fy":
      return { from: `${fyStart - 1}-04-01`, to: `${fyStart}-03-31` };
    case "this_month":
      return { from: iso(new Date(y, today.getMonth(), 1)), to: iso(new Date(y, today.getMonth() + 1, 0)) };
    case "last_12_months":
    default:
      return { from: iso(new Date(y, today.getMonth() - 11, 1)), to: iso(new Date(y, today.getMonth() + 1, 0)) };
  }
}

/** Mirrors the database check so the user sees the problem before a round trip. */
export function rangeError(r: DateRange): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.from) || !/^\d{4}-\d{2}-\d{2}$/.test(r.to)) return "Choose a start and end date.";
  if (r.to < r.from) return "The end date is before the start date.";
  const days = (Date.parse(r.to) - Date.parse(r.from)) / 86_400_000;
  if (days > 366 * 5) return "Choose a range of five years or less.";
  return null;
}

/** "2026-04" → "Apr 26" */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

/** Fills months with no trips so the chart has no gaps. */
export function fillMonths(range: DateRange, rows: TravelReport["by_month"]): TravelReport["by_month"] {
  const byKey = new Map(rows.map((r) => [r.month, r]));
  const out: TravelReport["by_month"] = [];
  const [fy, fm] = range.from.split("-").map(Number);
  const [ty, tm] = range.to.split("-").map(Number);
  let y = fy, m = fm;
  for (let i = 0; i < 61 && (y < ty || (y === ty && m <= tm)); i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push(byKey.get(key) ?? { month: key, trips: 0, spend: 0, travellers: 0 });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/** Ends the chart at the later of this month and the last month with trips, so future months don't show as a drop to zero. */
export function chartRange(range: DateRange, rows: TravelReport["by_month"], today: Date = new Date()): DateRange {
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const lastData = rows.reduce((max, r) => (r.month > max ? r.month : max), "");
  const end = `${lastData > thisMonth ? lastData : thisMonth}-01`;
  return { from: range.from, to: end < range.to ? end : range.to };
}

export async function getTravelReport(range: DateRange, filters: { department?: string; mode?: string } = {}): Promise<TravelReport> {
  const problem = rangeError(range);
  if (problem) throw new Error(problem);
  const { data, error } = await getSupabase().rpc("travel_report", {
    p_from: range.from,
    p_to: range.to,
    p_department: filters.department || null,
    p_mode: filters.mode || null,
  });
  if (error) throw friendlyError(error, "Could not load the report.");
  return data as TravelReport;
}

export async function getDashboardCounts(): Promise<DashboardCounts> {
  const { data, error } = await getSupabase().rpc("dashboard_counts");
  if (error) throw friendlyError(error, "Could not load your overview.");
  return data as DashboardCounts;
}

/**
 * Calls `onChange` (debounced) whenever a row the user can see changes in one
 * of the given tables. Realtime applies RLS before sending anything, and the
 * payload is ignored: the page simply re-runs its own permission-checked query.
 */
export function useLiveRefresh(tables: string[], onChange: () => void, enabled = true): void {
  const callback = useRef(onChange);
  callback.current = onChange;
  const key = tables.join(",");
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fire = () => {
      clearTimeout(timer);
      timer = setTimeout(() => callback.current(), 800);
    };
    let channel: ReturnType<ReturnType<typeof getSupabase>["channel"]> | null = null;
    try {
      const supabase = getSupabase();
      channel = supabase.channel(`live:${key}:${Math.random().toString(36).slice(2)}`);
      for (const table of key.split(",")) {
        channel.on("postgres_changes", { event: "*", schema: "public", table }, fire);
      }
      channel.subscribe();
    } catch {
      // Live updates are a convenience; the page still works without them.
    }
    return () => {
      clearTimeout(timer);
      if (channel) void getSupabase().removeChannel(channel);
    };
  }, [key, enabled]);
}
