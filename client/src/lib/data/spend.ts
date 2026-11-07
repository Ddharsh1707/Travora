import { getSupabase } from "../supabase";
import { friendlyError } from "./travel";
import { sanitizeTerm } from "./travelQuery";

/**
 * One list of all spend: employee expense claims and travel desk trips
 * (including Excel uploads). Reads the security-invoker view spend_items, so
 * Row Level Security decides which rows come back.
 */

export type SpendSource = "claim" | "trip";

export type SpendItem = {
  source: SpendSource;
  id: string;
  employee_id: string;
  employee_name: string;
  employee_code: string;
  department: string;
  spend_date: string;
  category: string;
  description: string | null;
  project_id: string | null;
  project_name: string | null;
  origin: string | null;
  destination: string | null;
  amount: number | null;
  currency: string;
  status: string;
  counted: number;
  provider: string | null;
  booking_reference: string | null;
  entered_by: string;
  has_receipt: boolean;
  import_batch_id: string | null;
  created_at: string;
};

export type SpendFilters = {
  from?: string;
  to?: string;
  source?: SpendSource | "";
  employee?: string;
  department?: string;
  project?: string; // uuid, "none" or ""
  category?: string;
  status?: string;
  q?: string;
};

export const SPEND_LIMIT = 5000;

const iso = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listSpendItems(f: SpendFilters = {}): Promise<{ rows: SpendItem[]; truncated: boolean }> {
  let q = getSupabase().from("spend_items").select("*")
    .order("spend_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(SPEND_LIMIT + 1);
  if (iso(f.from)) q = q.gte("spend_date", f.from!);
  if (iso(f.to)) q = q.lte("spend_date", f.to!);
  if (f.source) q = q.eq("source", f.source);
  if (f.employee && UUID.test(f.employee)) q = q.eq("employee_id", f.employee);
  if (f.department) q = q.eq("department", f.department.slice(0, 120));
  if (f.project === "none") q = q.is("project_id", null);
  else if (f.project && UUID.test(f.project)) q = q.eq("project_id", f.project);
  if (f.category) q = q.eq("category", f.category.slice(0, 40));
  if (f.status) q = q.eq("status", f.status.slice(0, 20));
  const term = sanitizeTerm(f.q);
  if (term) {
    const t = `"%${term}%"`;
    q = q.or([`employee_name.ilike.${t}`, `employee_code.ilike.${t}`, `description.ilike.${t}`, `project_name.ilike.${t}`,
      `origin.ilike.${t}`, `destination.ilike.${t}`, `booking_reference.ilike.${t}`].join(","));
  }
  const { data, error } = await q;
  if (error) throw friendlyError(error, "Could not load spend. Has the latest SQL been run in Supabase?");
  const rows = (data ?? []) as SpendItem[];
  return { rows: rows.slice(0, SPEND_LIMIT), truncated: rows.length > SPEND_LIMIT };
}

/** Totals for the rows on screen. Amounts that do not count (withdrawn, rejected, cancelled) are kept apart. */
export function summarizeSpend(rows: Pick<SpendItem, "source" | "counted" | "amount" | "employee_id">[]) {
  let claims = 0, trips = 0, notCounted = 0, missing = 0;
  const people = new Set<string>();
  for (const r of rows) {
    const c = Number(r.counted || 0);
    if (r.source === "claim") claims += c; else trips += c;
    if (r.amount === null || r.amount === undefined) missing++;
    else if (c === 0) notCounted += Number(r.amount);
    people.add(r.employee_id);
  }
  return { total: claims + trips, claims, trips, notCounted, missing, people: people.size, records: rows.length };
}

export const SOURCE_LABEL: Record<SpendSource, string> = { claim: "Employee claim", trip: "Travel desk trip" };
