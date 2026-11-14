import { z } from "zod";
import { getSupabase } from "../supabase";
import { friendlyError } from "./travel";
import { WORKFORCE_TYPE_LABELS, type WorkforceType } from "./imports";

/**
 * Temporary workforce: the worker directory, one worker's record and the
 * changes the Travel Desk and the Director can make. Every call goes through a
 * checked database function (20261115140000_workforce_manage.sql), which
 * decides who may see or change what; the screens only decide what is shown.
 */

export { WORKFORCE_TYPE_LABELS, type WorkforceType };

export type VerificationStatus = "imported_unverified" | "verified" | "possible_duplicate" | "merged";

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  imported_unverified: "Unverified (from an upload)",
  verified: "Verified",
  possible_duplicate: "Possible duplicate",
  merged: "Merged",
};

/** One row of the worker directory. Money is in the company's base currency only. */
export type WorkerRow = {
  id: string; full_name: string; employee_id: string; department: string | null;
  workforce_type: WorkforceType; verification_status: VerificationStatus; source: "manual" | "import" | "signup";
  active: boolean; has_login: boolean;
  contractor_id: string | null; contractor_name: string | null; project_id: string | null; project_name: string | null;
  merged_into: string | null; alias_count: number;
  trips: number; cancelled_trips: number; first_trip: string | null; last_trip: string | null;
  currency: string; gross: number; credits: number; net: number; missing_cost_lines: number; other_currency_trips: number;
  total_count: number;
};

export type WorkerFilters = {
  type?: WorkforceType | "non_permanent" | "";
  status?: VerificationStatus | "";
  contractor?: string | "none" | "";
  project?: string | "none" | "";
  q?: string;
  include_inactive?: boolean;
  include_merged?: boolean;
  sort?: "name" | "spend" | "trips" | "last_trip";
};

export type TripMoney = { currency: string; gross: number; credits: number; net: number; zero_lines: number; missing_lines: number };

export type WorkerDetail = {
  person: {
    id: string; full_name: string; employee_id: string; department: string | null; designation: string | null; email: string | null;
    workforce_type: WorkforceType; verification_status: VerificationStatus; source: string; active: boolean; has_login: boolean;
    work_location: string | null; contact_phone: string | null; merged_into: string | null; created_at: string; can_manage: boolean;
  };
  contractor: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  base_currency: string;
  aliases: Array<{ id: string; alias: string; source: "manual" | "import_link" | "merge"; created_at: string }>;
  trips: Array<{
    id: string; departure_date: string; return_date: string | null; origin: string | null; destination: string; booking_type: string;
    provider: string | null; booking_reference: string | null; status: string; source: string;
    project_id: string | null; project_name: string | null; import_batch_id: string | null; source_sheet: string | null; source_row: number | null;
    money: TripMoney[];
  }>;
  totals: {
    trips: number; cancelled_trips: number; first_trip: string | null; last_trip: string | null;
    gross: number; credits: number; net: number; missing_cost_lines: number; zero_fare_lines: number;
    other_currencies: Array<{ currency: string; net: number }>;
  };
  expenses: Array<{ id: string; expense_date: string; category: string; description: string; amount: number; currency: string; status: string }>;
  documents: Array<{ id: string; original_filename: string; document_type: string; storage_path: string; created_at: string; travel_record_id: string | null; filed_under: string }>;
  upload_batches: string[];
  merges: Array<{
    id: string; from_profile: string; into_profile: string; from_name: string; into_name: string; evidence: string;
    moved: Record<string, unknown>; merged_at: string; reversed_at: string | null;
  }>;
  history: Array<{ action: string; at: string; metadata: Record<string, unknown> }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only known filter keys and values are sent. */
export function cleanWorkerFilters(f: WorkerFilters): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const types = new Set<string>([...Object.keys(WORKFORCE_TYPE_LABELS), "non_permanent"]);
  if (f.type && types.has(f.type)) out.type = f.type;
  if (f.status && f.status in VERIFICATION_LABELS) out.status = f.status;
  if (f.contractor === "none" || (f.contractor && UUID.test(f.contractor))) out.contractor = f.contractor;
  if (f.project === "none" || (f.project && UUID.test(f.project))) out.project = f.project;
  const q = (f.q ?? "").trim().slice(0, 80);
  if (q) out.q = q;
  if (f.include_inactive) out.include_inactive = true;
  if (f.include_merged) out.include_merged = true;
  if (f.sort && ["name", "spend", "trips", "last_trip"].includes(f.sort)) out.sort = f.sort;
  return out;
}

export async function listWorkers(filters: WorkerFilters = {}, limit = 200, offset = 0): Promise<{ rows: WorkerRow[]; total: number }> {
  const { data, error } = await getSupabase().rpc("workforce_list", {
    p_filters: cleanWorkerFilters(filters), p_limit: Math.min(Math.max(limit, 1), 1000), p_offset: Math.max(offset, 0),
  });
  if (error) throw friendlyError(error, "Could not load the workers.");
  const rows = (data ?? []) as WorkerRow[];
  return { rows, total: rows[0]?.total_count ?? 0 };
}

export async function getWorker(id: string): Promise<WorkerDetail> {
  if (!UUID.test(id)) throw new Error("That worker could not be found.");
  const { data, error } = await getSupabase().rpc("workforce_detail", { p_profile: id });
  if (error) throw friendlyError(error, "Could not load this worker.");
  return data as WorkerDetail;
}

// ---------------------------------------------------------------------------
// Changes (Travel Desk and Director)
// ---------------------------------------------------------------------------
const name200 = z.string().transform((v) => v.replace(/\s+/g, " ").trim()).pipe(z.string().max(200, "Keep it under 200 characters"));
export const aliasInput = name200.pipe(z.string().min(2, "Type the other spelling of the name"));
export const contractorInput = name200; // empty clears the contractor
export const evidenceInput = z.string().transform((v) => v.trim()).pipe(z.string().min(3, "Say why (for example the work order or the sheet)").max(500, "Keep the note under 500 characters"));
export const mergeEvidenceInput = z.string().transform((v) => v.trim()).pipe(z.string().min(3, "Say why these are the same person").max(2000, "Keep the note under 2000 characters"));

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new Error(r.error.issues[0]?.message ?? "Please check what you typed.");
  return r.data;
}

async function call(fn: string, args: Record<string, unknown>, fallback: string): Promise<unknown> {
  const { data, error } = await getSupabase().rpc(fn, args);
  if (error) throw friendlyError(error, fallback);
  return data;
}

export const setWorkerType = (id: string, type: WorkforceType) =>
  call("workforce_set_type", { p_profile: id, p_type: type }, "Could not change the kind of worker.");

export const verifyWorker = (id: string) => call("workforce_verify", { p_profile: id }, "Could not verify this worker.");

export const addWorkerAlias = (id: string, alias: string) =>
  call("workforce_alias_add", { p_profile: id, p_alias: parse(aliasInput, alias) }, "Could not save the spelling.");

export const removeWorkerAlias = (aliasId: string) => call("workforce_alias_remove", { p_alias: aliasId }, "Could not remove the spelling.");

export const setWorkerContractor = (id: string, contractor: string) =>
  call("workforce_set_contractor", { p_profile: id, p_contractor: parse(contractorInput, contractor) || null }, "Could not save the contractor.");

export const setWorkerProject = (id: string, projectId: string | null, evidence: string) =>
  call("workforce_set_project", { p_profile: id, p_project: projectId, p_evidence: projectId ? parse(evidenceInput, evidence) : evidence.trim() || null },
    "Could not save the project.");

export const mergeWorkers = (fromId: string, intoId: string, evidence: string) =>
  call("workforce_merge", { p_from: fromId, p_into: intoId, p_evidence: parse(mergeEvidenceInput, evidence) }, "Could not merge these records.") as Promise<string>;

export const unmergeWorkers = (mergeId: string) => call("workforce_unmerge", { p_merge: mergeId }, "Could not undo the merge.");

/** Inactive / active uses the existing people action. */
export const setWorkerActive = (id: string, active: boolean) =>
  call("admin_set_active", { p_profile_id: id, p_active: active }, "Could not change whether this worker is active.");
