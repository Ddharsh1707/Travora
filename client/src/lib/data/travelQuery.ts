/**
 * Pure helpers for turning what a user typed into safe query filters.
 * No network access here, so this file is unit-tested directly.
 *
 * Security note: these filters only NARROW results. What a user may see at all
 * is decided by Row Level Security in the database, never by this code.
 */

export type RecordStatus = "confirmed" | "cancelled" | "completed";
export type BookingType = "flight" | "train" | "bus" | "cab" | "hotel" | "multi_modal" | "other";

export type TravelFilters = {
  q?: string;
  date?: string; // YYYY-MM-DD, exact day
  from?: string; // YYYY-MM-DD, range start (inclusive)
  to?: string; // YYYY-MM-DD, range end (inclusive)
  employeeId?: string; // profile uuid
  department?: string;
  origin?: string;
  destination?: string;
  provider?: string;
  bookingReference?: string;
  ticketNumber?: string;
  bookingType?: BookingType | "";
  status?: RecordStatus | "";
};

export type FilterOp =
  | { op: "eq"; column: string; value: string }
  | { op: "gte"; column: string; value: string }
  | { op: "lte"; column: string; value: string }
  | { op: "ilike"; column: string; value: string }
  | { op: "or"; value: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Letters (with their accents/vowel signs) and digits in any script, plus
// space ' - / @. Everything else, including LIKE wildcards % and _, is dropped.
const DISALLOWED_CHARS = new RegExp("[^\\p{L}\\p{M}\\p{N} '\\-/@]", "gu");
const STATUSES: RecordStatus[] = ["confirmed", "cancelled", "completed"];
const BOOKING_TYPES: BookingType[] = ["flight", "train", "bus", "cab", "hotel", "multi_modal", "other"];

/**
 * Keeps only characters that are meaningful in names, places and booking
 * references. This removes PostgREST filter syntax (commas, parentheses,
 * dots-with-operators) and LIKE wildcards so typed text cannot change the
 * shape of the query.
 */
export function sanitizeTerm(input: string | undefined | null, maxLength = 80): string {
  if (!input) return "";
  return input
    .normalize("NFKC")
    .replace(DISALLOWED_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function isValidIsoDate(value: string | undefined | null): value is string {
  if (!value || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Understands a date typed into the search box, e.g. "14 October 2026",
 * "Oct 14, 2026", "14/10/2026" (day first, as used in India) or "2026-10-14".
 * Accepts an optional leading phrase such as "show travel on". Returns
 * YYYY-MM-DD or null.
 */
export function parseDateQuery(input: string | undefined | null): string | null {
  if (!input) return null;
  const text = input
    .toLowerCase()
    .replace(/^\s*(show\s+)?(all\s+)?(travel|trips?)?\s*(on|for)?\s*/, "")
    .replace(/(\d+)(st|nd|rd|th)\b/g, "$1")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let y: number | undefined, m: number | undefined, d: number | undefined;
  let match: RegExpMatchArray | null;
  if ((match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = text.match(/^(\d{1,2}) ([a-z]+) (\d{4})$/)) && MONTHS[match[2]]) {
    [d, m, y] = [Number(match[1]), MONTHS[match[2]], Number(match[3])];
  } else if ((match = text.match(/^([a-z]+) (\d{1,2}) (\d{4})$/)) && MONTHS[match[1]]) {
    [m, d, y] = [MONTHS[match[1]], Number(match[2]), Number(match[3])];
  } else {
    return null;
  }
  const iso = `${y}-${pad(m!)}-${pad(d!)}`;
  return isValidIsoDate(iso) ? iso : null;
}

/** Converts filters into a list of query operations. Invalid values are dropped. */
export function buildRecordFilterOps(filters: TravelFilters): FilterOp[] {
  const ops: FilterOp[] = [];
  const typedDate = parseDateQuery(filters.q);
  const date = isValidIsoDate(filters.date) ? filters.date : typedDate;

  if (date) {
    ops.push({ op: "eq", column: "departure_date", value: date });
  } else {
    if (isValidIsoDate(filters.from)) ops.push({ op: "gte", column: "departure_date", value: filters.from });
    if (isValidIsoDate(filters.to)) ops.push({ op: "lte", column: "departure_date", value: filters.to });
  }

  if (filters.employeeId && UUID.test(filters.employeeId)) ops.push({ op: "eq", column: "employee_id", value: filters.employeeId });

  const contains = (column: string, raw?: string) => {
    const term = sanitizeTerm(raw);
    if (term) ops.push({ op: "ilike", column, value: `%${term}%` });
  };
  contains("department", filters.department);
  contains("origin", filters.origin);
  contains("destination", filters.destination);
  contains("airline_or_provider", filters.provider);
  contains("booking_reference", filters.bookingReference);
  contains("ticket_number", filters.ticketNumber);

  if (filters.status && STATUSES.includes(filters.status)) ops.push({ op: "eq", column: "status", value: filters.status });
  if (filters.bookingType && BOOKING_TYPES.includes(filters.bookingType)) {
    ops.push({ op: "eq", column: "booking_type", value: filters.bookingType });
  }

  // Free text (when it is not a date) searches the most useful columns at once.
  if (!typedDate) {
    const term = sanitizeTerm(filters.q);
    if (term) {
      const like = `*${term}*`;
      const cols = ["employee_name", "employee_code", "booking_reference", "ticket_number", "origin", "destination", "airline_or_provider"];
      ops.push({ op: "or", value: cols.map((c) => `${c}.ilike.${like}`).join(",") });
    }
  }
  return ops;
}

/** Applies ops to a Supabase query builder (kept generic to avoid tight typing). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyFilterOps<Q extends Record<string, any>>(query: Q, ops: FilterOp[]): Q {
  let q = query;
  for (const o of ops) {
    if (o.op === "or") q = q.or(o.value);
    else q = q[o.op](o.column, o.value);
  }
  return q;
}

export function summarizeRecords(rows: Array<{ amount: number | string | null; status: string; departure_date: string }>, today = new Date()) {
  const todayIso = today.toISOString().slice(0, 10);
  const active = rows.filter((r) => r.status !== "cancelled");
  const spend = active.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const past = active.filter((r) => r.departure_date <= todayIso).map((r) => r.departure_date).sort();
  const upcoming = active.filter((r) => r.departure_date > todayIso).map((r) => r.departure_date).sort();
  return {
    totalTrips: active.length,
    totalSpend: Math.round(spend * 100) / 100,
    lastTrip: past.length ? past[past.length - 1] : null,
    nextTrip: upcoming.length ? upcoming[0] : null,
    upcomingTrips: upcoming.length,
  };
}
