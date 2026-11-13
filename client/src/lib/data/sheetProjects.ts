import { getSupabase } from "../supabase";
import type { BiFilters } from "./bi";
import { friendlyError, listAllRequests, type TravelRequest } from "./travel";
import { projectKey } from "../projectLinks";
import type { SheetTrip } from "../projectTeamReport";

const SELECT = "id, employee_id, departure_date, return_date, origin, destination, booking_type, airline_or_provider, booking_reference, status, project_raw, purpose, amount, currency, source_sheet, project:projects(name), profile:profiles!travel_records_employee_id_fkey(full_name, employee_id, department)";
const PAGE = 1000;
const MAX = 20000;

/** Every booking that has a project name in its sheet (or a project), with the filters applied. */
export async function getSheetProjectTrips(f: BiFilters): Promise<SheetTrip[]> {
  const out: SheetTrip[] = [];
  for (let from = 0; from < MAX; from += PAGE) {
    let q = getSupabase().from("travel_records").select(SELECT)
      .or("project_raw.not.is.null,project_id.not.is.null")
      .order("departure_date", { ascending: false }).order("id").range(from, from + PAGE - 1);
    if (f.from) q = q.gte("departure_date", f.from);
    if (f.to) q = q.lte("departure_date", f.to);
    if (f.employee) q = q.eq("employee_id", f.employee);
    if (f.category) q = q.eq("booking_type", f.category);
    if (f.destination) q = q.ilike("destination", f.destination);
    const { data, error } = await q;
    if (error) throw friendlyError(error, "Could not load the projects.");
    const rows = (data ?? []) as unknown as SheetTrip[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return f.department
    ? out.filter((t) => ((t.profile?.department ?? "").trim() || "Not recorded") === f.department)
    : out;
}

/** An employee claim tagged with a project, as the project page shows it. */
export type ProjectClaim = {
  id: string; employee_id: string; employee_name: string; employee_code: string; spend_date: string; category: string;
  description: string | null; project_name: string | null; amount: number | null; currency: string; status: string; counted: number;
};

/**
 * Claims whose project name groups with this project (same key as the
 * sheets: capitals, spaces and dashes do not matter). Reads spend_items, so
 * Row Level Security decides what comes back.
 */
export async function getProjectClaims(key: string, f: Pick<BiFilters, "from" | "to" | "employee"> = {}): Promise<ProjectClaim[]> {
  let q = getSupabase().from("spend_items")
    .select("id, employee_id, employee_name, employee_code, spend_date, category, description, project_name, amount, currency, status, counted")
    .eq("source", "claim").not("project_name", "is", null)
    .order("spend_date", { ascending: false }).limit(2000);
  if (f.from) q = q.gte("spend_date", f.from);
  if (f.to) q = q.lte("spend_date", f.to);
  if (f.employee) q = q.eq("employee_id", f.employee);
  const { data, error } = await q;
  if (error) throw friendlyError(error, "Could not load the claims for this project.");
  return ((data ?? []) as ProjectClaim[]).filter((c) => projectKey(c.project_name) === key);
}

/** Travel requests whose "Project / site" groups with this project. */
export async function getProjectRequests(key: string, f: Pick<BiFilters, "employee"> = {}): Promise<TravelRequest[]> {
  const list = await listAllRequests({ status: "all", limit: 500, employeeId: f.employee || undefined });
  return list.filter((r) => projectKey(r.project_name) === key);
}
