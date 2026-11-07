import { getSupabase } from "../supabase";
import { friendlyError } from "./travel";

/** A trip with every fact the upload kept, including each original cell. */
export type DetailedTrip = {
  id: string; employee_id: string; request_id: string | null;
  booking_reference: string | null; origin: string | null; destination: string; route: string | null;
  departure_date: string; return_date: string | null; airline_or_provider: string | null; ticket_number: string | null;
  amount: number | string | null; currency: string; booking_type: string; status: string; source: string; created_at: string;
  project_raw: string | null; purpose: string | null; booking_date: string | null; requisition_date: string | null;
  payment_mode: string | null; consultant: string | null; approved_by_text: string | null;
  source_sheet: string | null; source_row: number | null; notes: string[] | null; extra: Record<string, string> | null;
  import_batch_id: string | null;
  project?: { name: string } | null;
  cost_lines?: Array<{ line_type: string; amount: number | string | null; amount_state: string; description: string | null; source_row: number | null }> | null;
};

export type UploadColumns = { id: string; filename: string; sheets: Record<string, string[]> };

const TRIP_SELECT = "id, employee_id, request_id, booking_reference, origin, destination, route, departure_date, return_date, airline_or_provider, ticket_number, amount, currency, booking_type, status, source, created_at, project_raw, purpose, booking_date, requisition_date, payment_mode, consultant, approved_by_text, source_sheet, source_row, notes, extra, import_batch_id, project:projects(name), cost_lines(line_type, amount, amount_state, description, source_row)";

export async function getEmployeeTrips(employeeId: string): Promise<DetailedTrip[]> {
  const { data, error } = await getSupabase().from("travel_records").select(TRIP_SELECT)
    .eq("employee_id", employeeId).order("departure_date", { ascending: true }).limit(2000);
  if (error) throw friendlyError(error, "Could not load travel history.");
  return (data ?? []) as unknown as DetailedTrip[];
}

const letterIndex = (l: string) => l.split("").reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);

/** Column order of each uploaded sheet, so the file's columns show in file order. Staff only; others get none. */
export async function getUploadColumns(batchIds: string[]): Promise<Record<string, UploadColumns>> {
  const ids = Array.from(new Set(batchIds.filter(Boolean))).slice(0, 100);
  if (!ids.length) return {};
  const { data, error } = await getSupabase().from("import_batches").select("id, original_filename, sheets").in("id", ids);
  if (error || !data) return {};
  const out: Record<string, UploadColumns> = {};
  for (const b of data as Array<{ id: string; original_filename: string; sheets: unknown }>) {
    const sheets: Record<string, string[]> = {};
    for (const s of (Array.isArray(b.sheets) ? b.sheets : []) as Array<{ name: string; mapped?: Array<{ column: string; header: string }>; unmapped?: Array<{ column: string; header: string }> }>) {
      const cols = [...(s.mapped ?? []), ...(s.unmapped ?? [])].filter((c) => c.header).sort((a, b) => letterIndex(a.column) - letterIndex(b.column));
      sheets[s.name] = Array.from(new Set(cols.map((c) => c.header)));
    }
    out[b.id] = { id: b.id, filename: b.original_filename, sheets };
  }
  return out;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export type SpendBreakdown = { key: string; trips: number; spend: number };
export type EmployeeSpend = {
  trips: number; spend: number; withoutCost: number;
  cancelledTrips: number; cancelledValue: number;
  refunds: number; extras: number; inFile: number;
  byMode: SpendBreakdown[]; byMonth: SpendBreakdown[]; byProject: SpendBreakdown[]; byDestination: SpendBreakdown[];
  byCharge: Array<{ key: string; lines: number; amount: number }>;
  firstTrip: string | null; lastTrip: string | null;
};

const EXTRA_TYPES = new Set(["addon", "reissue", "change_fee", "cancellation_fee"]);

/**
 * Money for one employee, the same way the reports count it:
 *  - spend = what each booked trip cost (all its charges), cancelled trips left out;
 *  - cancelled bookings are shown on their own, so spend + cancelled = the file total;
 *  - refunds and extra charges (add-ons, reissues, change fees) are shown too.
 */
export function summarizeEmployeeSpend(trips: DetailedTrip[]): EmployeeSpend {
  const groups = { mode: new Map<string, SpendBreakdown>(), month: new Map<string, SpendBreakdown>(), project: new Map<string, SpendBreakdown>(), dest: new Map<string, SpendBreakdown>() };
  const add = (m: Map<string, SpendBreakdown>, key: string, spend: number) => {
    const g = m.get(key) ?? { key, trips: 0, spend: 0 };
    g.trips += 1; g.spend = r2(g.spend + spend); m.set(key, g);
  };
  const charges = new Map<string, { key: string; lines: number; amount: number }>();
  let spend = 0, withoutCost = 0, cancelledTrips = 0, cancelledValue = 0, refunds = 0, extras = 0, active = 0;
  const dates: string[] = [];
  for (const t of trips) {
    const amount = num(t.amount);
    for (const l of t.cost_lines ?? []) {
      const a = num(l.amount);
      if (a === null) continue;
      const c = charges.get(l.line_type) ?? { key: l.line_type, lines: 0, amount: 0 };
      c.lines += 1; c.amount = r2(c.amount + a); charges.set(l.line_type, c);
      if (a < 0) refunds = r2(refunds + a);
      if (EXTRA_TYPES.has(l.line_type) && t.status !== "cancelled") extras = r2(extras + a);
    }
    if (t.status === "cancelled") {
      cancelledTrips += 1;
      cancelledValue = r2(cancelledValue + (amount ?? 0));
      continue;
    }
    active += 1;
    dates.push(t.departure_date);
    if (amount === null) withoutCost += 1;
    const a = amount ?? 0;
    spend = r2(spend + a);
    add(groups.mode, t.booking_type, a);
    add(groups.month, t.departure_date.slice(0, 7), a);
    add(groups.project, t.project?.name ?? t.project_raw ?? "Not recorded", a);
    add(groups.dest, (t.destination || "Not recorded").toUpperCase(), a);
  }
  dates.sort();
  const bySpend = (m: Map<string, SpendBreakdown>) => Array.from(m.values()).sort((a, b) => b.spend - a.spend || b.trips - a.trips);
  return {
    trips: active, spend, withoutCost, cancelledTrips, cancelledValue, refunds, extras, inFile: r2(spend + cancelledValue),
    byMode: bySpend(groups.mode),
    byMonth: Array.from(groups.month.values()).sort((a, b) => a.key.localeCompare(b.key)),
    byProject: bySpend(groups.project),
    byDestination: bySpend(groups.dest).slice(0, 10),
    byCharge: Array.from(charges.values()).sort((a, b) => b.amount - a.amount),
    firstTrip: dates[0] ?? null, lastTrip: dates[dates.length - 1] ?? null,
  };
}

/** Every original column of each uploaded sheet, in file order, with this employee's rows. */
export function fileTables(trips: DetailedTrip[], columns: Record<string, UploadColumns>) {
  const tables = new Map<string, { key: string; title: string; headers: string[]; rows: DetailedTrip[] }>();
  for (const t of trips) {
    if (!t.extra || !Object.keys(t.extra).length) continue;
    const file = t.import_batch_id ? columns[t.import_batch_id] : undefined;
    const key = `${t.import_batch_id ?? "none"}|${t.source_sheet ?? ""}`;
    let tb = tables.get(key);
    if (!tb) {
      const ordered = file?.sheets[t.source_sheet ?? ""] ?? [];
      tb = { key, title: [file?.filename, t.source_sheet].filter(Boolean).join(" · ") || "Uploaded file", headers: [...ordered], rows: [] };
      tables.set(key, tb);
    }
    for (const h of Object.keys(t.extra)) if (!tb.headers.includes(h)) tb.headers.push(h);
    tb.rows.push(t);
  }
  // Only columns that have a value for this employee.
  return Array.from(tables.values()).map((tb) => ({ ...tb, headers: tb.headers.filter((h) => tb.rows.some((r) => r.extra?.[h])) }));
}
