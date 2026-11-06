import { getSupabase } from "../supabase";
import { friendlyError } from "./travel";
import type { BookingType } from "./travelQuery";

/**
 * Bulk / group bookings. Each traveller gets their own travel record, so the
 * trip appears in their history, search and totals. All writes go through the
 * bulk_save / bulk_cancel / bulk_review database functions, which check roles.
 */

export type BulkStatus = "confirmed" | "cancelled";
export type ReviewStatus = "pending_review" | "approved" | "noted";

export type BulkBooking = {
  id: string;
  title: string;
  group_reference: string;
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string | null;
  booking_type: BookingType;
  provider: string | null;
  total_cost: number | null;
  currency: string;
  savings: number | null;
  project: string | null;
  notes: string | null;
  status: BulkStatus;
  review_status: ReviewStatus;
  review_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
  members?: Array<{ count: number }>;
};

export type BulkMember = {
  id: string;
  employee_id: string;
  seat_or_coach: string | null;
  booking_reference: string | null;
  ticket_number: string | null;
  amount: number | null;
  travel_record_id: string | null;
  profile: { full_name: string; employee_id: string; department: string | null } | null;
  record: { status: string; amount: number | null; documents: Array<{ count: number }> } | null;
};

export type BulkBookingInput = {
  title: string;
  group_reference: string;
  origin: string;
  destination: string;
  departure_date: string;
  return_date?: string;
  booking_type: string;
  provider?: string;
  total_cost?: string;
  currency?: string;
  savings?: string;
  project?: string;
  notes?: string;
};

export type BulkMemberInput = {
  employee_id?: string;
  employee_code?: string;
  seat_or_coach?: string;
  booking_reference?: string;
  ticket_number?: string;
  amount?: string;
};

export const MAX_TRAVELLERS = 500;

/** Turns pasted text ("EMP001, EMP002\nEMP003") into a clean list of employee IDs. */
export function parseEmployeeCodes(text: string): string[] {
  const codes = text
    .split(/[\s,;|]+/)
    .map((c) => c.trim().toUpperCase().replace(/[^A-Z0-9_\-/.]/g, ""))
    .filter((c) => c.length > 0 && c.length <= 64);
  return Array.from(new Set(codes)).slice(0, MAX_TRAVELLERS);
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

export async function listBulkBookings(opts: { status?: BulkStatus; review?: ReviewStatus } = {}): Promise<BulkBooking[]> {
  let q = getSupabase().from("bulk_bookings").select("*, members:bulk_booking_members(count)").order("departure_date", { ascending: false }).limit(200);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.review) q = q.eq("review_status", opts.review);
  const { data, error } = await q;
  if (error) throw friendlyError(error, "Could not load bulk bookings.");
  return (data ?? []) as BulkBooking[];
}

export async function getBulkBooking(id: string): Promise<{ booking: BulkBooking; members: BulkMember[] }> {
  const supabase = getSupabase();
  const [{ data: booking, error: e1 }, { data: members, error: e2 }] = await Promise.all([
    supabase.from("bulk_bookings").select("*").eq("id", id).single(),
    supabase
      .from("bulk_booking_members")
      .select("id, employee_id, seat_or_coach, booking_reference, ticket_number, amount, travel_record_id, profile:profiles!bulk_booking_members_employee_id_fkey(full_name, employee_id, department), record:travel_records(status, amount, documents(count))")
      .eq("bulk_booking_id", id)
      .order("created_at", { ascending: true })
      .limit(MAX_TRAVELLERS),
  ]);
  if (e1 || !booking) throw friendlyError(e1, "Could not load the bulk booking.");
  if (e2) throw friendlyError(e2, "Could not load the travellers.");
  const rows = ((members ?? []) as unknown as BulkMember[]).map((m) => ({ ...m, profile: one(m.profile), record: one(m.record) }));
  rows.sort((a, b) => (a.profile?.full_name ?? "").localeCompare(b.profile?.full_name ?? ""));
  return { booking: booking as BulkBooking, members: rows };
}

export async function saveBulkBooking(id: string | null, booking: BulkBookingInput, members: BulkMemberInput[]): Promise<string> {
  if (members.length === 0) throw new Error("Add at least one traveller.");
  if (members.length > MAX_TRAVELLERS) throw new Error(`A bulk booking can have at most ${MAX_TRAVELLERS} travellers.`);
  const strip = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]).filter(([, v]) => v !== "" && v !== undefined && v !== null));
  const { data, error } = await getSupabase().rpc("bulk_save", { p_id: id, p_booking: strip(booking), p_members: members.map(strip) });
  if (error) throw friendlyError(error, "Could not save the bulk booking.");
  return data as string;
}

export async function cancelBulkBooking(id: string, reason?: string): Promise<void> {
  const { error } = await getSupabase().rpc("bulk_cancel", { p_id: id, p_reason: reason?.slice(0, 500) ?? null });
  if (error) throw friendlyError(error, "Could not cancel the bulk booking.");
}

export async function reviewBulkBooking(id: string, decision: "approved" | "noted", comment?: string): Promise<void> {
  const { error } = await getSupabase().rpc("bulk_review", { p_id: id, p_decision: decision, p_comment: comment?.slice(0, 2000) ?? null });
  if (error) throw friendlyError(error, "Could not save the review.");
}
