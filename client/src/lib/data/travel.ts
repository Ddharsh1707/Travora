import { z } from "zod";
import { getSupabase } from "../supabase";
import { applyFilterOps, buildRecordFilterOps, sanitizeTerm, type BookingType, type TravelFilters } from "./travelQuery";

/**
 * Supabase data access for employees, travel requests and travel records.
 * Every call runs as the signed-in user; Row Level Security decides which rows
 * come back. Inputs are validated here only to give clear error messages.
 */

export type TravelRecord = {
  id: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  department: string | null;
  request_id: string | null;
  booking_reference: string | null;
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string | null;
  airline_or_provider: string | null;
  ticket_number: string | null;
  amount: number | null;
  currency: string;
  booking_type: BookingType;
  status: "confirmed" | "cancelled" | "completed";
  source: string;
  created_at: string;
};

export type EmployeeSummary = {
  employee_id: string;
  employee_code: string;
  employee_name: string;
  department: string | null;
  designation: string | null;
  active: boolean;
  total_trips: number;
  total_spend: number;
  last_trip_date: string | null;
  next_trip_date: string | null;
  upcoming_trips: number;
};

export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled" | "booked" | "completed";

export type TravelRequest = {
  id: string;
  employee_id: string;
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string | null;
  purpose: string;
  travel_type: BookingType;
  estimated_cost: number | null;
  currency: string;
  status: RequestStatus;
  approver_id: string | null;
  created_at: string;
  employee?: { full_name: string; employee_id: string; department: string | null } | null;
  approver?: { full_name: string } | null;
};

/** Turns database errors into messages that are safe to show. */
export function friendlyError(error: { code?: string; message?: string } | null | undefined, fallback = "Something went wrong. Please try again."): Error {
  if (!error) return new Error(fallback);
  switch (error.code) {
    case "42501":
      return new Error("You don't have permission to do that.");
    case "23505":
      return new Error("This looks like a duplicate of an existing record.");
    case "23514":
    case "22023":
    case "22001":
      // Messages from our own checks are written for users; constraint names are not.
      return new Error(error.message && !/constraint|violates/i.test(error.message) ? error.message : "Some details are not valid. Please check the form.");
    case "P0002":
      return new Error("That record could not be found.");
    default:
      return new Error(fallback);
  }
}

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export async function listEmployees(opts: { q?: string; department?: string; limit?: number; offset?: number } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  let query = getSupabase()
    .from("employee_travel_summary")
    .select("*", { count: "exact" })
    .order("employee_name", { ascending: true })
    .range(offset, offset + limit - 1);
  const term = sanitizeTerm(opts.q);
  if (term) query = query.or(`employee_name.ilike.*${term}*,employee_code.ilike.*${term}*`);
  const dept = sanitizeTerm(opts.department);
  if (dept) query = query.ilike("department", `%${dept}%`);
  const { data, error, count } = await query;
  if (error) throw friendlyError(error, "Could not load employees.");
  return { rows: (data ?? []) as EmployeeSummary[], count: count ?? (data?.length ?? 0) };
}

export async function getEmployeeSummary(employeeId: string): Promise<EmployeeSummary | null> {
  const { data, error } = await getSupabase().from("employee_travel_summary").select("*").eq("employee_id", employeeId).maybeSingle();
  if (error) throw friendlyError(error, "Could not load this employee.");
  return (data as EmployeeSummary) ?? null;
}

export async function listDepartments(): Promise<string[]> {
  const { data, error } = await getSupabase().from("profiles").select("department").not("department", "is", null).limit(1000);
  if (error) return [];
  return Array.from(new Set((data ?? []).map((r: { department: string }) => r.department))).sort();
}

// ---------------------------------------------------------------------------
// Travel records
// ---------------------------------------------------------------------------

export async function searchTravelRecords(filters: TravelFilters, opts: { limit?: number; offset?: number; ascending?: boolean } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  const base = getSupabase()
    .from("travel_records_search")
    .select("*", { count: "exact" })
    .order("departure_date", { ascending: opts.ascending ?? false })
    .range(offset, offset + limit - 1);
  const { data, error, count } = await applyFilterOps(base, buildRecordFilterOps(filters));
  if (error) throw friendlyError(error, "Could not search travel records.");
  return { rows: (data ?? []) as TravelRecord[], count: count ?? (data?.length ?? 0) };
}

export async function getEmployeeHistory(employeeId: string): Promise<TravelRecord[]> {
  const { rows } = await searchTravelRecords({ employeeId }, { limit: 500, ascending: true });
  return rows;
}

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : null));

export const travelRecordInput = z
  .object({
    employee_id: z.string().uuid("Choose an employee"),
    request_id: z.string().uuid().optional().nullable(),
    origin: z.string().trim().min(1, "From is required").max(120),
    destination: z.string().trim().min(1, "To is required").max(120),
    departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a travel date"),
    return_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).transform((v) => (v ? v : null)),
    airline_or_provider: optionalText(120),
    booking_reference: optionalText(64),
    ticket_number: optionalText(64),
    amount: z.coerce.number().min(0, "Amount cannot be negative").max(10_000_000).optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).default("INR"),
    booking_type: z.enum(["flight", "train", "bus", "cab", "hotel", "multi_modal", "other"]).default("flight"),
    status: z.enum(["confirmed", "cancelled", "completed"]).default("confirmed"),
  })
  .refine((v) => !v.return_date || v.return_date >= v.departure_date, { message: "Return date is before the travel date", path: ["return_date"] });

export type TravelRecordInput = z.input<typeof travelRecordInput>;

function firstIssue(err: z.ZodError): Error {
  return new Error(err.issues[0]?.message ?? "Some details are not valid.");
}

export async function createTravelRecord(input: TravelRecordInput): Promise<void> {
  const parsed = travelRecordInput.safeParse(input);
  if (!parsed.success) throw firstIssue(parsed.error);
  const { error } = await getSupabase().from("travel_records").insert({ ...parsed.data, source: "manual" });
  if (error) throw friendlyError(error, "Could not save the trip.");
}

export async function updateTravelRecord(id: string, input: TravelRecordInput): Promise<void> {
  const parsed = travelRecordInput.safeParse(input);
  if (!parsed.success) throw firstIssue(parsed.error);
  const { error } = await getSupabase().from("travel_records").update(parsed.data).eq("id", id);
  if (error) throw friendlyError(error, "Could not update the trip.");
}

// ---------------------------------------------------------------------------
// Travel requests and approvals
// ---------------------------------------------------------------------------

const REQUEST_SELECT =
  "*, employee:profiles!travel_requests_employee_id_fkey(full_name, employee_id, department), approver:profiles!travel_requests_approver_id_fkey(full_name)";

export const travelRequestInput = z
  .object({
    origin: z.string().trim().min(1, "From is required").max(120),
    destination: z.string().trim().min(1, "To is required").max(120),
    departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a travel date"),
    return_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).transform((v) => (v ? v : null)),
    purpose: z.string().trim().min(3, "Tell us the purpose of the trip").max(2000),
    travel_type: z.enum(["flight", "train", "bus", "cab", "hotel", "multi_modal", "other"]).default("flight"),
    estimated_cost: z.coerce.number().min(0).max(10_000_000).optional(),
  })
  .refine((v) => !v.return_date || v.return_date >= v.departure_date, { message: "Return date is before the travel date", path: ["return_date"] });

export type TravelRequestInput = z.input<typeof travelRequestInput>;

export async function listMyRequests(myProfileId: string): Promise<TravelRequest[]> {
  const { data, error } = await getSupabase()
    .from("travel_requests")
    .select(REQUEST_SELECT)
    .eq("employee_id", myProfileId)
    .order("departure_date", { ascending: false })
    .limit(200);
  if (error) throw friendlyError(error, "Could not load your requests.");
  return (data ?? []) as TravelRequest[];
}

export async function createMyRequest(myProfileId: string, input: TravelRequestInput): Promise<void> {
  const parsed = travelRequestInput.safeParse(input);
  if (!parsed.success) throw firstIssue(parsed.error);
  // employee_id is checked by RLS; status and approver are set by the database.
  const { error } = await getSupabase().from("travel_requests").insert({ ...parsed.data, employee_id: myProfileId });
  if (error) throw friendlyError(error, "Could not submit the request.");
}

export async function cancelMyRequest(id: string): Promise<void> {
  const { error } = await getSupabase().from("travel_requests").update({ status: "cancelled" }).eq("id", id);
  if (error) throw friendlyError(error, "Could not cancel the request.");
}

export async function listPendingApprovals(myProfileId: string): Promise<TravelRequest[]> {
  const { data, error } = await getSupabase()
    .from("travel_requests")
    .select(REQUEST_SELECT)
    .eq("status", "pending")
    .neq("employee_id", myProfileId)
    .order("departure_date", { ascending: true })
    .limit(200);
  if (error) throw friendlyError(error, "Could not load approvals.");
  return (data ?? []) as TravelRequest[];
}

export async function decideRequest(id: string, decision: "approved" | "rejected", comments?: string): Promise<void> {
  const note = comments?.trim().slice(0, 2000) || null;
  const { error } = await getSupabase().rpc("decide_travel_request", { p_request_id: id, p_decision: decision, p_comments: note });
  if (error) throw friendlyError(error, "Could not record the decision.");
}

export async function recordReportGenerated(report: "employee_travel_history" | "travel_search", employeeId?: string): Promise<void> {
  await getSupabase().rpc("record_report_generated", { p_report: report, p_employee: employeeId ?? null });
}
