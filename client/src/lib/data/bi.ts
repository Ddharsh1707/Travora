import { useEffect, useState } from "react";
import { getSupabase } from "../supabase";
import { friendlyError } from "./travel";

/**
 * Business Intelligence data. Every call goes to a database function that runs
 * with the signed-in person's own permissions, so approvers only ever get
 * numbers for their own team. Employees are refused by the database.
 *
 * Money rules (worked out in the database, shown as-is here):
 *  - spend = cost of bookings that are not cancelled, base currency only
 *  - cancelled cost is reported separately
 *  - "missing" (no cost in the sheet) and "shared" (covered by a merged cost on
 *    another line) are counted, never shown as 0
 *  - other currencies are listed on their own, never added in
 */

export type BiFilters = {
  from?: string;
  to?: string;
  project?: string; // project id or "unassigned"
  employee?: string;
  department?: string;
  destination?: string;
  category?: string;
};

export type CostState = "recorded" | "zero" | "shared" | "missing";

export type FilterOptions = {
  base_currency: string;
  projects: { id: string; name: string; kind: string }[];
  departments: string[];
  employees: { id: string; name: string; code: string }[];
  destinations: string[];
  categories: string[];
  first_date: string | null;
  last_date: string | null;
};

export type Kpis = {
  bookings: number;
  travellers: number;
  spend: number;
  costed_bookings: number;
  missing_cost: number;
  shared_cost: number;
  zero_cost?: number;
  cancelled: number;
  cancelled_cost: number;
  no_show?: number;
  projects_with_travel?: number;
  unassigned_bookings?: number;
  places?: number;
  first_date: string | null;
  last_date: string | null;
};

export type OtherCurrency = { currency: string; bookings: number; spend: number };
export type MonthPoint = { month: string; bookings: number; spend: number; travellers: number };

export type Overview = {
  base_currency: string;
  kpis: Kpis;
  active_projects: number;
  other_currencies: OtherCurrency[];
  monthly: MonthPoint[];
  top_projects: { project_id: string | null; name: string; kind: string | null; bookings: number; travellers: number; spend: number }[];
  departments: { department: string; bookings: number; travellers: number; spend: number }[];
  destinations: { destination: string; bookings: number; travellers: number; spend: number }[];
  categories: { category: string; bookings: number; spend: number }[];
  recent: {
    id: string; employee_id: string; full_name: string; departure_date: string; origin: string | null; destination: string | null;
    category: string; project_name: string | null; project_raw: string | null; amount: number | null; currency: string;
    cost_state: CostState; status: string;
  }[];
};

export type ProjectStatus = "active" | "completed" | "on_hold" | "unknown";
export type ProjectKind = "project" | "cost_centre" | "event" | "other";

export type ProjectRow = {
  project_id: string; name: string; code: string | null; kind: ProjectKind; status: ProjectStatus;
  client: string | null; site: string | null; country: string | null; start_date: string | null; end_date: string | null;
  bookings: number; travellers: number; spend: number; avg_per_booking: number | null; without_cost: number;
  first_date: string | null; last_date: string | null; monthly: { month: string; spend: number }[];
};

export type ProjectsReport = {
  base_currency: string;
  status_counts: { total: number; active: number; completed: number; on_hold: number; unknown: number; cost_centres: number; events: number; other: number };
  travellers_on_projects: number;
  projects: ProjectRow[];
  unassigned: {
    bookings: number; travellers: number; spend: number; avg_per_booking: number | null; without_cost: number;
    first_date: string | null; last_date: string | null; monthly: { month: string; spend: number }[];
    names: { project_raw: string; bookings: number; spend: number }[];
  };
  months: string[];
};

export type Project = {
  id: string; name: string; code: string | null; kind: ProjectKind; status: ProjectStatus; client: string | null;
  site: string | null; country: string | null; start_date: string | null; end_date: string | null; notes: string | null;
};

export type LedgerRow = {
  id: string; employee_id: string; full_name: string; employee_code: string; departure_date: string; return_date: string | null;
  origin: string | null; destination: string | null; route: string | null; category: string; provider: string | null;
  booking_reference: string | null; status: string; project_raw: string | null; purpose: string | null;
  amount: number | null; currency: string; cost_state: CostState; source_sheet: string | null; cost_lines: number;
};

export type ProjectDetail = {
  base_currency: string;
  project: Project | null;
  aliases: string[];
  kpis: Kpis;
  other_currencies: OtherCurrency[];
  employees: { employee_id: string; full_name: string; employee_code: string; department: string; bookings: number; spend: number; without_cost: number; first_date: string; last_date: string }[];
  monthly: MonthPoint[];
  routes: { origin: string; destination: string; bookings: number; spend: number }[];
  destinations: { destination: string; bookings: number; spend: number }[];
  providers: { provider: string; category: string; bookings: number; spend: number }[];
  categories: { category: string; bookings: number; spend: number }[];
  purposes: { purpose: string; bookings: number; spend: number }[];
  ledger: LedgerRow[];
  ledger_total: number;
};

/** Drops empty values so the database sees only the filters that are set. */
export function cleanFilters(f: BiFilters): BiFilters {
  const out: BiFilters = {};
  for (const [k, v] of Object.entries(f) as [keyof BiFilters, string | undefined][]) {
    if (v && v.trim()) out[k] = v.trim();
  }
  return out;
}

async function call<T>(fn: string, args: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await getSupabase().rpc(fn, args);
  if (error) throw friendlyError(error, fallback);
  return data as T;
}

export const getFilterOptions = () => call<FilterOptions>("bi_filter_options", {}, "Could not load the filters.");
export const getOverview = (f: BiFilters) => call<Overview>("bi_overview", { p_filters: cleanFilters(f) }, "Could not load the overview.");
export const getProjects = (f: BiFilters) => call<ProjectsReport>("bi_projects", { p_filters: cleanFilters(f) }, "Could not load the projects.");
export const getProjectDetail = (id: string | null, f: BiFilters) =>
  call<ProjectDetail>("bi_project_detail", { p_project: id, p_filters: cleanFilters(f) }, "Could not load the project.");

/** CEO only: link a trip to a project by hand (null removes a manual link). */
export async function assignTripProject(tripId: string, projectId: string | null): Promise<void> {
  await call<null>("trip_assign_project", { p_trip: tripId, p_project: projectId }, "Could not change the project.");
}

/** CEO only: project details that are not in the travel sheet. */
export async function updateProject(p: Project): Promise<Project> {
  return call<Project>("project_update", {
    p_id: p.id, p_name: p.name, p_kind: p.kind, p_code: p.code || null, p_client: p.client || null, p_site: p.site || null,
    p_country: p.country || null, p_status: p.status, p_start: p.start_date || null, p_end: p.end_date || null, p_notes: p.notes || null,
  }, "Could not save the project.");
}

// ---------------------------------------------------------------------------
// Filters shared by every BI page, kept for the browser tab
// ---------------------------------------------------------------------------
const KEY = "trapple-bi-filters";
let current: BiFilters = (() => {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as BiFilters) : {};
  } catch {
    return {};
  }
})();
const listeners = new Set<(f: BiFilters) => void>();

export function setBiFilters(next: BiFilters): void {
  current = cleanFilters(next);
  try { sessionStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage may be blocked */ }
  listeners.forEach((l) => l(current));
}

export function useBiFilters(): [BiFilters, (f: BiFilters) => void] {
  const [f, setF] = useState<BiFilters>(current);
  useEffect(() => {
    listeners.add(setF);
    return () => { listeners.delete(setF); };
  }, []);
  return [f, setBiFilters];
}

export const STATUS_LABEL: Record<ProjectStatus, string> = { active: "Active", completed: "Completed", on_hold: "On hold", unknown: "Status not set" };
export const KIND_LABEL: Record<ProjectKind, string> = { project: "Project", cost_centre: "Cost centre", event: "Event", other: "Other" };
export const COST_STATE_LABEL: Record<CostState, string> = { recorded: "Recorded", zero: "Zero in sheet", shared: "Shared cost", missing: "No cost in sheet" };

/** Adds the months with no travel between the first and last month, so gaps show as gaps. */
export function fillMonthGaps(points: MonthPoint[]): MonthPoint[] {
  if (points.length < 2) return points;
  const byKey = new Map(points.map((p) => [p.month, p]));
  const sorted = points.map((p) => p.month).sort();
  const [fy, fm] = sorted[0].split("-").map(Number);
  const last = sorted[sorted.length - 1];
  const out: MonthPoint[] = [];
  let y = fy, m = fm;
  for (let i = 0; i < 61; i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push(byKey.get(key) ?? { month: key, bookings: 0, spend: 0, travellers: 0 });
    if (key >= last) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}
