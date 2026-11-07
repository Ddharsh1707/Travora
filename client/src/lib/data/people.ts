import { getSupabase } from "../supabase";
import { friendlyError } from "./travel";

/** One employee in the CEO / Admin overview, built from uploads, bookings and claims. */
export type PersonSpend = {
  employee_id: string; employee_code: string; full_name: string; department: string | null; designation: string | null;
  active: boolean; has_login: boolean;
  trips: number; travel: number; cancelled_value: number; claims: number; claimed: number; total: number;
  first_trip: string | null; last_trip: string | null; top_destination: string | null; modes: string | null; projects: string | null;
};

export type PeopleOverview = {
  uploads: { files: number; lines: number; last_upload: string | null };
  totals: { trips: number; spend: number; cancelled_trips: number; cancelled_value: number; from_uploads: number; without_cost: number };
  by_mode: Array<{ mode: string; trips: number; spend: number }>;
  people: PersonSpend[];
};

export async function getPeopleOverview(from?: string, to?: string): Promise<PeopleOverview> {
  const { data, error } = await getSupabase().rpc("people_spend_overview", { p_from: from ?? null, p_to: to ?? null });
  if (error) throw friendlyError(error, "Could not load the employee overview. Has the latest SQL been run in Supabase?");
  return data as PeopleOverview;
}
