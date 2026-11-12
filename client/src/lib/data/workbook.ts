/**
 * Reads real company travel workbooks: several sheets (air, hotel, bus/train,
 * cab, visa, forex), title rows above the header, merged cost cells, summary
 * blocks under the table, status words typed into the wrong column, and the
 * airline style of names ("KETA/RAJU MR").
 *
 * Everything here is pure, so it can be tested without a browser. The
 * database checks every line again (import_stage_v2); this code prepares the
 * lines and explains what it found, so nothing is dropped silently.
 */
import { normalizeDateCell, normalizeHeader, type CellValue } from "./importParser";

export type RecordKind = "flight" | "train" | "bus" | "cab" | "hotel" | "visa" | "forex" | "other";
export type Merge = { r0: number; c0: number; r1: number; c1: number }; // zero-based, inclusive
export type SheetInput = { name: string; rows: CellValue[][]; merges: Merge[] };

export const WB_FIELDS = [
  { key: "employee_code", label: "Employee ID" },
  { key: "employee_name", label: "Traveller name" },
  { key: "department", label: "Department" },
  { key: "booking_date", label: "Booking date" },
  { key: "departure_date", label: "Travel / check-in date" },
  { key: "return_date", label: "Return / check-out date" },
  { key: "requisition_date", label: "Requisition date" },
  { key: "requisition_channel", label: "Requisition raised through" },
  { key: "sector", label: "Sector / route" },
  { key: "origin", label: "From" },
  { key: "destination", label: "To / place" },
  { key: "provider", label: "Airline / hotel / operator" },
  { key: "vendor", label: "Vendor" },
  { key: "booking_reference", label: "PNR / confirmation" },
  { key: "ticket_number", label: "Ticket number" },
  { key: "ticket_extra", label: "Extra ticket / notes" },
  { key: "amount", label: "Cost" },
  { key: "currency", label: "Currency" },
  { key: "payment_mode", label: "Payment mode" },
  { key: "project", label: "Project" },
  { key: "purpose", label: "Purpose" },
  { key: "consultant", label: "Travel desk consultant" },
  { key: "approved_by", label: "Approved by (HOD)" },
  { key: "remarks", label: "Remarks" },
] as const;
export type WbField = (typeof WB_FIELDS)[number]["key"];

// Headings seen in real sheets, after normalizeHeader(). Exact matches only.
const ALIASES: Record<WbField, string[]> = {
  employee_code: ["employee id", "employee code", "emp id", "emp code", "empid", "staff id", "employee number", "emp no", "employee no", "badge id"],
  employee_name: ["passenger name", "passenger", "names", "name", "employee name", "employee", "traveller name", "traveler name", "traveller", "traveler", "emp name", "guest name", "pax name", "staff name", "full name"],
  department: ["department", "dept", "division", "business unit", "department name"],
  booking_date: ["date", "booking date", "issue date", "date of booking", "issued on"],
  departure_date: ["ob date ticket", "ob date", "travel date", "departure date", "date of travel", "journey date", "onward", "onward date", "check in", "check in date", "checkin", "pick up date", "pickup date", "booking date time", "pick up time", "flight date", "start date"],
  return_date: ["ib date ticket", "ib date", "return", "return date", "check out", "check out date", "checkout", "end date"],
  requisition_date: ["travel requistion date", "travel requisition date", "requisition date", "forex requisition date", "request date"],
  requisition_channel: ["travel requistion raised thorugh confirmed", "travel requisition raised through confirmed", "requisition raised through", "requisition raised", "requisition raised by"],
  sector: ["sector", "sectors", "route", "routing", "itinerary"],
  origin: ["from", "origin", "departure", "source", "from city", "from location", "departure city"],
  destination: ["to", "destination", "site", "place", "location", "to city", "to location", "arrival city", "country"],
  provider: ["airline", "carrier", "airline name", "hotel name", "hotel", "travels name", "operator", "service provider"],
  vendor: ["vendor", "agency", "travel agent"],
  booking_reference: ["pnr", "pnr no", "pnr number", "confirmation number", "confirmation no", "booking reference", "booking ref", "booking id", "application id"],
  ticket_number: ["ticket number", "ticket no", "e ticket", "eticket", "ticket id"],
  ticket_extra: ["ticket booked in adv", "ticket booked in advance", "extra", "add on", "addon"],
  amount: ["cost", "amount", "fare", "total cost", "ticket cost", "travel cost", "price", "total amount", "total fare", "amount inr", "amount rs", "hotel cost"],
  currency: ["currency", "currency type", "curr"],
  payment_mode: ["payment mode", "payment", "paid by", "mode of payment"],
  project: ["project", "projects", "project code", "project name", "project id", "job number", "job no", "cost centre", "cost center"],
  purpose: ["purpose of visit", "purpose", "reason", "purpose of travel"],
  consultant: ["consultant name", "consultant", "travel desk"],
  approved_by: ["hod approval", "approved by", "approver", "approval", "hod"],
  remarks: ["remarks", "remark", "notes", "comments", "comment"],
};

const HEADER_INDEX = new Map<string, WbField>();
for (const [f, list] of Object.entries(ALIASES) as [WbField, string[]][]) for (const a of list) if (!HEADER_INDEX.has(a)) HEADER_INDEX.set(a, f);

export function fieldForHeader(h: string): WbField | "" {
  return HEADER_INDEX.get(normalizeHeader(h)) ?? "";
}

export function columnLetter(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

const isBlank = (v: CellValue) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const text = (v: CellValue) => (isBlank(v) ? "" : v instanceof Date ? normalizeDateCell(v) : String(v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim());

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------
const TITLES = new Set(["MR", "MRS", "MS", "MISS", "MSTR", "DR", "SHRI", "SMT", "PAX"]);

/** Same rule as private.person_name_key() in the database. */
export function personNameKey(raw: string): string {
  let t = String(raw ?? "").toUpperCase();
  if (t.includes("/")) {
    const [a, b] = t.split("/", 2);
    t = `${b ?? ""} ${a}`;
  }
  const words = t.replace(/[^A-Z]+/g, " ").split(" ").filter((w) => w && !TITLES.has(w));
  return words.sort().join(" ");
}

/** "KETA/RAJU MR" -> "Raju Keta"; "MR. SATHEESH PONNUSAMY" -> "Satheesh Ponnusamy". */
export function displayName(raw: string): string {
  let t = String(raw ?? "").trim();
  if (t.includes("/")) {
    const [a, b] = t.split("/", 2);
    t = `${b ?? ""} ${a}`;
  }
  const words = t
    .replace(/[^A-Za-z.' -]+/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/\.+$/, ""))
    .filter((w) => w && !TITLES.has(w.toUpperCase().replace(/\./g, "")));
  return words.map((w) => (w.length <= 2 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(" ");
}

/** Detects several travellers on one line ("A, Mrs. B", "Mr. X(2PAX)"). Returns the first name and a note. */
export function splitTravellers(raw: string): { first: string; note: string | null } {
  const t = String(raw ?? "").trim();
  const pax = t.match(/\(\s*(\d+)\s*pax\s*\)/i);
  if (pax && Number(pax[1]) > 1) {
    return { first: t.replace(pax[0], "").trim(), note: `${pax[1]} travellers on one line; cost kept with ${displayName(t.replace(pax[0], ""))}` };
  }
  const parts = t.split(/\s*(?:,|&|\band\b|\+)\s*/i).filter((p) => p.trim());
  if (parts.length > 1 && !t.includes("/")) {
    return { first: parts[0], note: `${parts.length} travellers on one line (${parts.map(displayName).join(", ")}); cost kept with the first name` };
  }
  return { first: t, note: null };
}

// ---------------------------------------------------------------------------
// Dates and places
// ---------------------------------------------------------------------------
const MON: Record<string, number> = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

/** Returns YYYY-MM-DD, or "" when the cell has no readable date. Also returns an end date for "03 SEP 26 TO 10 SEP 26". */
export function readDate(v: CellValue): { date: string; end: string } {
  if (isBlank(v)) return { date: "", end: "" };
  if (v instanceof Date || typeof v === "number") {
    const d = normalizeDateCell(v);
    return { date: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "", end: "" };
  }
  const t = String(v).trim().toUpperCase();
  const found: string[] = [];
  const re = /(\d{1,2})\s*[- ]?\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s*[- ]?\s*(\d{4}|\d{2})(?!\d)/g;
  for (const m of Array.from(t.matchAll(re))) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = iso(y, MON[m[2]], Number(m[1]));
    if (d) found.push(d);
  }
  if (!found.length) {
    for (const m of Array.from(t.matchAll(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/g))) {
      const d = iso(Number(m[3]), Number(m[2]), Number(m[1]));
      if (d) found.push(d);
    }
  }
  if (!found.length) {
    const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const d = iso(Number(m[1]), Number(m[2]), Number(m[3]));
      if (d) found.push(d);
    }
  }
  return { date: found[0] ?? "", end: found.length > 1 && /\bTO\b/.test(t) ? found[found.length - 1] : "" };
}

/** "BOM-ADD-ROB-ADD-ACC-BOM" -> points; "SECUNDERABAD JN (SC) - SAMALKOT JN (SLO)" -> 2 points. */
export function splitRoute(raw: string): { points: string[]; origin: string; destination: string; route: string } {
  const t = String(raw ?? "").trim();
  if (!t) return { points: [], origin: "", destination: "", route: "" };
  const parts = (/\s-\s|\s+TO\s+/i.test(t) ? t.split(/\s+-\s+|\s+TO\s+/i) : t.split(/\s*[-–]\s*/))
    .map((p) => p.replace(/\((BUS|TRAIN|FLIGHT)\)/gi, "").replace(/\s+/g, " ").trim().toUpperCase())
    .filter(Boolean);
  if (parts.length < 2) return { points: parts, origin: "", destination: parts[0] ?? "", route: parts.join(" - ") };
  const origin = parts[0];
  // A round trip (back to where it started) is reported by its last stop before home.
  const destination = parts.length >= 3 && parts[parts.length - 1] === origin ? parts[parts.length - 2] : parts[parts.length - 1];
  return { points: parts, origin, destination, route: parts.join(" - ") };
}

// ---------------------------------------------------------------------------
// Status words and add-ons typed into other columns
// ---------------------------------------------------------------------------
export type StatusScan = { status: "" | "cancelled" | "no_show" | "reissued" | "refunded"; lineType: "" | "addon" | "reissue" | "refund"; notes: string[] };

export function scanStatus(cells: Array<{ field: string; header: string; value: string }>, travelDate = ""): StatusScan {
  const out: StatusScan = { status: "", lineType: "", notes: [] };
  for (const { field, header, value } of cells) {
    if (!value) continue;
    const where = header || "a column";
    // "11 SEP 26 IS CANCELLED" on a booking that starts 10 Sep cancels only part of it.
    const named = readDate(value).date;
    if (named && travelDate && named !== travelDate && /cancel|no\s*-?\s*show/i.test(value)) {
      out.notes.push(`Part of the booking marked "${value}" in ${where}; the rest stands`);
      continue;
    }
    if (/cancel/i.test(value)) {
      out.status = "cancelled";
      out.notes.push(`Marked "${value}" in ${where}; refund not recorded in the sheet`);
    } else if (/no\s*-?\s*show/i.test(value)) {
      if (field === "return_date") out.notes.push(`Return marked "${value}" in ${where}`);
      else {
        if (out.status !== "cancelled") out.status = "no_show";
        out.notes.push(`Marked "${value}" in ${where}`);
      }
    } else if (/re-?\s*issu/i.test(value)) {
      if (!out.status) out.status = "reissued";
      out.lineType = "reissue";
      out.notes.push(`Marked "${value}" in ${where}`);
    } else if (/refund/i.test(value)) {
      out.status = "refunded";
      out.lineType = "refund";
      out.notes.push(`Marked "${value}" in ${where}`);
    } else if (/(extra\s*(luggage|baggage|bag)|excess\s*bag|baggage|seat|meal|upgrade)/i.test(value)) {
      if (!out.lineType) out.lineType = "addon";
      out.notes.push(`Extra charge: ${value}`);
    } else if (/business|bussiness|first\s*class|premium/i.test(value) && field !== "remarks") {
      out.notes.push(`Cabin: ${value}`);
    }
  }
  return out;
}

const STATUS_WORD = /(cancel|no\s*-?\s*show|re-?\s*issu|refund|luggage|baggage|business|bussiness)/i;

// ---------------------------------------------------------------------------
// Sheet analysis
// ---------------------------------------------------------------------------
export type ColumnPlan = { index: number; letter: string; header: string; field: WbField | ""; filled: number; sample: string };
export type SkippedBlock = { fromRow: number; toRow: number; reason: string; preview: string };
export type SheetPlan = {
  name: string;
  kind: RecordKind;
  status: "data" | "empty" | "no_header" | "blank";
  reason: string;
  headerRow: number; // 1-based, 0 when none
  firstRow: number; // 1-based first data row
  lastRow: number; // 1-based last data row of the main table
  columns: ColumnPlan[];
  dataRows: number;
  skipped: SkippedBlock[];
};

function headerScore(row: CellValue[]): number {
  let n = 0;
  for (const c of row) if (typeof c === "string" && fieldForHeader(c)) n++;
  return n;
}

function kindFor(name: string, titles: string, headers: string[]): RecordKind {
  const h = new Set(headers.map(normalizeHeader));
  const n = `${name} ${titles}`.toUpperCase();
  const score: Record<RecordKind, number> = { flight: 0, train: 0, bus: 0, cab: 0, hotel: 0, visa: 0, forex: 0, other: 0 };
  const has = (...k: string[]) => k.filter((x) => h.has(x)).length;
  score.flight += has("pnr", "airline", "ticket number", "ob date ticket", "ib date ticket") * 2 + (/\b(AIR|FLIGHT|TICKETING)\b/.test(n) ? 3 : 0);
  score.hotel += has("hotel name", "check in", "check out", "checkin", "checkout") * 2 + (/\b(HOTEL|ACCOMMODATION|ACCOMODATION|STAY)\b/.test(n) ? 3 : 0);
  score.cab += has("vehicle type and package", "pick up", "drop off", "package") * 2 + (/\b(CAB|CAR|TAXI)\b/.test(n) ? 3 : 0);
  score.bus += has("travels name") * 2 + (/\bBUS\b/.test(n) ? 3 : 0);
  score.train += /\b(TRAIN|RAIL)\b/.test(n) ? 3 : 0;
  score.visa += has("application id", "visa status") * 2 + (/\bVISA\b/.test(n) ? 3 : 0);
  score.forex += has("approved currency", "currency type", "submission of lerms") * 2 + (/\bFOREX\b/.test(n) ? 3 : 0);
  let best: RecordKind = "other";
  for (const k of Object.keys(score) as RecordKind[]) if (score[k] > score[best]) best = k;
  if (best === "train" && score.bus > 0) best = "bus"; // "BUS AND TRAIN": decided per row
  return score[best] > 0 ? best : "other";
}

/** Fills merged cells (except costs, which become one shared cost) so every row is complete. */
function expandMerges(rows: CellValue[][], merges: Merge[], costCols: Set<number>): { rows: CellValue[][]; shared: Map<number, { key: string; first: boolean }> } {
  const out = rows.map((r) => [...r]);
  const shared = new Map<number, { key: string; first: boolean }>();
  for (const m of merges) {
    const v = rows[m.r0]?.[m.c0];
    for (let r = m.r0; r <= m.r1; r++) {
      for (let c = m.c0; c <= m.c1; c++) {
        if (r === m.r0 && c === m.c0) continue;
        if (!out[r]) out[r] = [];
        if (costCols.has(c) && m.r1 > m.r0) continue;
        if (isBlank(out[r][c])) out[r][c] = v;
      }
      if (m.r1 > m.r0 && Array.from(costCols).some((c) => c >= m.c0 && c <= m.c1)) {
        shared.set(r, { key: `${columnLetter(m.c0)}${m.r0 + 1}:${columnLetter(m.c1)}${m.r1 + 1}`, first: r === m.r0 });
      }
    }
  }
  return { rows: out, shared };
}

export function analyzeSheet(sheet: SheetInput): SheetPlan {
  const rows = sheet.rows;
  const base: SheetPlan = { name: sheet.name, kind: "other", status: "blank", reason: "", headerRow: 0, firstRow: 0, lastRow: 0, columns: [], dataRows: 0, skipped: [] };
  const nonBlank = rows.filter((r) => r && r.some((c) => !isBlank(c)));
  if (!nonBlank.length) return { ...base, reason: "The sheet is empty." };

  let hi = -1;
  let best = 0;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const s = headerScore(rows[i] ?? []);
    if (s > best) {
      best = s;
      hi = i;
    }
  }
  if (hi < 0 || best < 3) {
    return { ...base, kind: kindFor(sheet.name, "", []), status: "no_header", reason: "No header row found (a heading such as Passenger Name, Date or Cost). Nothing from this sheet is imported; check it by hand if it holds bookings." };
  }

  const titles = rows.slice(0, hi).map((r) => (r ?? []).map(text).join(" ")).join(" ");
  const header = rows[hi] ?? [];
  const width = Math.max(...rows.map((r) => r?.length ?? 0));
  // The header runs from its first heading until two blank headings in a row.
  // Headings further right (after a gap) belong to a separate list.
  let firstHeader = header.findIndex((c) => !isBlank(c));
  if (firstHeader < 0) firstHeader = 0;
  let lastHeader = firstHeader;
  for (let c = firstHeader + 1; c < header.length; c++) {
    if (!isBlank(header[c])) lastHeader = c;
    else if (isBlank(header[c + 1])) break;
  }

  // Main table ends after two blank rows in a row. Later blocks are reported, not imported.
  let end = rows.length - 1;
  let blanks = 0;
  for (let r = hi + 1; r < rows.length; r++) {
    const blank = !(rows[r] ?? []).slice(0, lastHeader + 1).some((c) => !isBlank(c));
    blanks = blank ? blanks + 1 : 0;
    if (blanks >= 2) {
      end = r - 2;
      break;
    }
  }
  while (end > hi && !(rows[end] ?? []).slice(0, lastHeader + 1).some((c) => !isBlank(c))) end--;

  // Unnamed columns right next to the table belong to it (remarks); anything after an empty column is a separate list.
  const colFilled = (c: number) => {
    let n = 0;
    for (let r = hi + 1; r <= end; r++) if (!isBlank(rows[r]?.[c])) n++;
    return n;
  };
  let tableEnd = lastHeader;
  while (tableEnd + 1 < width && colFilled(tableEnd + 1) > 0 && isBlank(header[tableEnd + 1])) tableEnd++;
  const skipped: SkippedBlock[] = [];
  let sideStart = -1;
  for (let c = tableEnd + 1; c < width; c++) {
    if (sideStart < 0 && (colFilled(c) > 0 || !isBlank(header[c]))) {
      sideStart = c;
    }
  }
  if (sideStart >= 0) {
    let lastSide = sideStart;
    let count = 0;
    let firstVal = "";
    for (let c = sideStart; c < width; c++) {
      for (let r = 0; r < rows.length; r++) {
        const v = rows[r]?.[c];
        if (!isBlank(v)) {
          lastSide = Math.max(lastSide, c);
          count++;
          if (!firstVal) firstVal = text(v);
        }
      }
    }
    skipped.push({
      fromRow: 1, toRow: rows.length,
      reason: `Separate list in columns ${columnLetter(sideStart)}–${columnLetter(lastSide)} (${count} values), not part of the bookings table`,
      preview: firstVal.slice(0, 80),
    });
  }

  const columns: ColumnPlan[] = [];
  const usedFields = new Set<WbField>();
  for (let c = 0; c <= tableEnd; c++) {
    const h = text(header[c]);
    let field: WbField | "" = h ? fieldForHeader(h) : "remarks";
    if (field && usedFields.has(field)) field = "";
    if (field) usedFields.add(field);
    const filled = colFilled(c);
    let sample = "";
    for (let r = hi + 1; r <= end && !sample; r++) sample = text(rows[r]?.[c]).slice(0, 60);
    if (!h && !filled) continue;
    columns.push({ index: c, letter: columnLetter(c), header: h || `Column ${columnLetter(c)} (no heading)`, field, filled, sample });
  }

  // Report blocks below the main table (for example an event summary that repeats costs).
  let r = end + 1;
  while (r < rows.length) {
    while (r < rows.length && !(rows[r] ?? []).some((c) => !isBlank(c))) r++;
    if (r >= rows.length) break;
    const start = r;
    let b = 0;
    while (r < rows.length && b < 2) {
      b = (rows[r] ?? []).some((c) => !isBlank(c)) ? 0 : b + 1;
      r++;
    }
    const stop = r - 1 - b;
    const first = (rows[start] ?? []).map(text).filter(Boolean).join(" | ");
    const looksHeader = headerScore(rows[start] ?? []) >= 2 || (rows[start] ?? []).filter((c) => typeof c === "string").length >= 3;
    skipped.push({
      fromRow: start + 1, toRow: stop + 1,
      reason: looksHeader
        ? `A second table with its own headings (rows ${start + 1}–${stop + 1}); usually a summary that repeats costs, so it is not imported`
        : `Rows ${start + 1}–${stop + 1} sit below the main table and are not imported`,
      preview: first.slice(0, 120),
    });
  }

  const nameCol = columns.find((c) => c.field === "employee_name" || c.field === "employee_code");
  let dataRows = 0;
  if (nameCol) for (let x = hi + 1; x <= end; x++) if (!isBlank(rows[x]?.[nameCol.index])) dataRows++;
  const kind = kindFor(sheet.name, titles, columns.map((c) => c.header));
  return {
    ...base,
    kind,
    status: dataRows ? "data" : "empty",
    reason: dataRows ? "" : "Has headings but no bookings (an empty template).",
    headerRow: hi + 1,
    firstRow: hi + 2,
    lastRow: end + 1,
    columns,
    dataRows,
    skipped,
  };
}

// ---------------------------------------------------------------------------
// Lines for the database
// ---------------------------------------------------------------------------
export type UploadLine = {
  kind: RecordKind; sheet: string; source_row: string;
  employee_code: string; employee_name: string; display_name: string; department: string;
  departure_date: string; return_date: string; booking_date: string; requisition_date: string;
  origin: string; destination: string; route: string;
  provider: string; booking_reference: string; ticket_number: string;
  amount: string; currency: string; line_type: string; amount_state: string; group_key: string; record_status: string;
  project: string; purpose: string; consultant: string; approved_by: string; requisition_channel: string; payment_mode: string;
  notes: string[];
  raw: Record<string, string>;
};

export type SheetLines = { lines: UploadLine[]; skippedRows: Array<{ row: number; reason: string }> };

const TOTAL_ROW = /^(grand\s*)?(sub\s*)?total\b/i;

export function buildLines(sheet: SheetInput, plan: SheetPlan, mapping?: Record<number, WbField | "">): SheetLines {
  const out: SheetLines = { lines: [], skippedRows: [] };
  if (plan.status !== "data") return out;
  const fieldOf = (c: ColumnPlan): WbField | "" => (mapping && c.index in mapping ? mapping[c.index] : c.field);
  const colFor = new Map<WbField, ColumnPlan>();
  for (const c of plan.columns) {
    const f = fieldOf(c);
    if (f && !colFor.has(f)) colFor.set(f, c);
  }
  const costCols = new Set<number>(colFor.get("amount") ? [colFor.get("amount")!.index] : []);
  const { rows, shared } = expandMerges(sheet.rows, sheet.merges, costCols);
  const get = (row: CellValue[], f: WbField) => {
    const c = colFor.get(f);
    return c ? row[c.index] : null;
  };
  const seen = new Map<string, number>(); // same person + PNR + date earlier in this sheet

  for (let r = plan.firstRow - 1; r <= plan.lastRow - 1; r++) {
    const row = rows[r] ?? [];
    if (!row.some((c) => !isBlank(c))) continue;
    const rawName = text(get(row, "employee_name"));
    const code = text(get(row, "employee_code"));
    if (!rawName && !code) {
      const joined = row.map(text).filter(Boolean).join(" ");
      out.skippedRows.push({ row: r + 1, reason: TOTAL_ROW.test(joined) ? "Total row" : `No traveller on this row (${joined.slice(0, 60)})` });
      continue;
    }
    if (TOTAL_ROW.test(rawName)) {
      out.skippedRows.push({ row: r + 1, reason: "Total row" });
      continue;
    }

    const notes: string[] = [];
    const raw: Record<string, string> = {};
    for (const c of plan.columns) {
      const v = text(row[c.index]);
      if (v) raw[c.header.slice(0, 80)] = v.slice(0, 300);
    }

    const { first, note } = splitTravellers(rawName);
    if (note) notes.push(note);

    // Dates
    const booking = readDate(get(row, "booking_date"));
    let dep = readDate(get(row, "departure_date"));
    const ret = readDate(get(row, "return_date"));
    const req = readDate(get(row, "requisition_date"));
    let kind = plan.kind;
    const provider = text(get(row, "provider"));
    const vendor = text(get(row, "vendor"));
    const sectorRaw = text(get(row, "sector"));
    if (kind === "bus" || kind === "train") {
      kind = /IRCTC|\bRAIL|\bJN\b|\(SC\)|TRAIN/i.test(`${provider} ${sectorRaw}`) && !/\(BUS\)/i.test(sectorRaw) ? "train" : "bus";
    }
    if (!dep.date && kind === "cab") {
      // Cab sheets keep the pick-up time as text ("02SEP26 AT 9:50") in the booking column.
      const pick = readDate(get(row, "booking_date"));
      if (pick.date) dep = pick;
    }
    if (!dep.date && kind === "cab" && req.date) {
      dep = req;
      notes.push("Pick-up date not readable; requisition date used");
    }
    // Status words can be anywhere except the name; the usual places are ticket and date columns.
    const scanCells: Array<{ field: string; header: string; value: string }> = [];
    for (const c of plan.columns) {
      const f = fieldOf(c);
      if (f === "employee_name" || f === "purpose" || f === "project") continue;
      const v = row[c.index];
      if (typeof v === "string" && STATUS_WORD.test(v) && !(f === "provider" && !/cancel|no\s*show|refund/i.test(v))) {
        scanCells.push({ field: f || "", header: c.header, value: v.trim() });
      }
    }
    const scan = scanStatus(scanCells, dep.date);
    notes.push(...scan.notes);

    let ticket = text(get(row, "ticket_number"));
    if (STATUS_WORD.test(ticket) && !/\d{6,}/.test(ticket)) ticket = "";

    const depRaw = text(get(row, "departure_date"));
    if (!dep.date && depRaw && STATUS_WORD.test(depRaw)) dep = { date: "", end: "" };

    // Places
    let origin = text(get(row, "origin"));
    let destination = text(get(row, "destination"));
    let route = "";
    if (sectorRaw) {
      const sp = splitRoute(sectorRaw);
      route = sp.route;
      if (!origin) origin = sp.origin;
      if (!destination || kind === "flight" || kind === "train" || kind === "bus") destination = sp.destination || destination;
    }
    if (kind === "hotel" || kind === "cab") origin = "";

    // Cost
    const amountCell = get(row, "amount");
    let amount = typeof amountCell === "number" ? String(Math.round(amountCell * 100) / 100) : text(amountCell);
    let amountState = "";
    let groupKey = "";
    const sh = shared.get(r);
    if (sh) {
      groupKey = `${plan.name}!${sh.key}`;
      if (!sh.first) {
        amount = "";
        amountState = "included_in_group";
        notes.push(`Cost shared with other rows (cells ${sh.key})`);
      } else notes.push(`Cost covers several rows (cells ${sh.key})`);
    }
    if (amount && !/^-?[\d,.\s₹]+$/.test(amount.replace(/^(INR|RS\.?)/i, ""))) {
      notes.push(`Cost cell says "${amount}"`);
      amount = "";
    }

    let lineType: string = scan.lineType;
    const pnr = text(get(row, "booking_reference")).toUpperCase();
    const key = `${personNameKey(first) || code}|${pnr}|${dep.date}`;
    if (pnr && dep.date) {
      const prev = seen.get(key);
      if (prev !== undefined && !lineType) {
        lineType = "addon";
        notes.push(`Extra charge on the same booking as row ${prev} (PNR ${pnr})`);
      }
      if (prev === undefined) seen.set(key, r + 1);
    }
    if (!lineType) lineType = kind === "hotel" ? "hotel" : kind === "cab" ? "cab" : kind === "visa" ? "visa" : kind === "forex" ? "forex" : "fare";

    out.lines.push({
      kind,
      sheet: plan.name,
      source_row: String(r + 1),
      employee_code: code,
      employee_name: first.slice(0, 200),
      display_name: displayName(first).slice(0, 200),
      department: text(get(row, "department")),
      departure_date: dep.date || (depRaw && !STATUS_WORD.test(depRaw) ? depRaw : ""),
      return_date: ret.date || dep.end,
      booking_date: booking.date,
      requisition_date: req.date,
      origin,
      destination,
      route,
      provider: provider || vendor,
      booking_reference: pnr.slice(0, 64),
      ticket_number: ticket.slice(0, 64),
      amount,
      currency: text(get(row, "currency")).slice(0, 3),
      line_type: lineType,
      amount_state: amountState,
      group_key: groupKey,
      record_status: scan.status,
      project: text(get(row, "project")),
      purpose: text(get(row, "purpose")),
      consultant: text(get(row, "consultant")),
      approved_by: text(get(row, "approved_by")),
      requisition_channel: text(get(row, "requisition_channel")),
      payment_mode: text(get(row, "payment_mode")),
      notes,
      raw,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Whole workbook
// ---------------------------------------------------------------------------
export type WorkbookSummary = {
  sheets: SheetPlan[];
  lines: UploadLine[];
  perSheet: Record<string, { lines: number; skippedRows: Array<{ row: number; reason: string }>; total: number; withoutCost: number; shared: number }>;
};

export function analyzeWorkbook(sheets: SheetInput[], mappings: Record<string, Record<number, WbField | "">> = {}): WorkbookSummary {
  const plans = sheets.map(analyzeSheet);
  const lines: UploadLine[] = [];
  const perSheet: WorkbookSummary["perSheet"] = {};
  sheets.forEach((s, i) => {
    const res = buildLines(s, plans[i], mappings[s.name]);
    lines.push(...res.lines);
    let total = 0;
    let withoutCost = 0;
    let sharedN = 0;
    for (const l of res.lines) {
      const n = Number(l.amount.replace(/[^\d.-]/g, ""));
      if (l.amount && Number.isFinite(n)) total += n;
      else if (l.amount_state === "included_in_group") sharedN++;
      else withoutCost++;
    }
    perSheet[s.name] = { lines: res.lines.length, skippedRows: res.skippedRows, total: Math.round(total * 100) / 100, withoutCost, shared: sharedN };
  });
  return { sheets: plans, lines, perSheet };
}

/** A compact record of what was found, saved with the upload. */
export function sheetSummaryForDb(summary: WorkbookSummary, mappings: Record<string, Record<number, WbField | "">> = {}) {
  return summary.sheets.map((p) => ({
    name: p.name.slice(0, 120),
    kind: p.kind,
    status: p.status,
    reason: p.reason,
    header_row: p.headerRow,
    data_rows: p.dataRows,
    lines: summary.perSheet[p.name]?.lines ?? 0,
    recorded_total: summary.perSheet[p.name]?.total ?? 0,
    mapped: p.columns.filter((c) => (mappings[p.name]?.[c.index] ?? c.field)).map((c) => ({ column: c.letter, header: c.header.slice(0, 80), field: mappings[p.name]?.[c.index] ?? c.field })),
    unmapped: p.columns.filter((c) => !(mappings[p.name]?.[c.index] ?? c.field)).map((c) => ({ column: c.letter, header: c.header.slice(0, 80) })),
    skipped: p.skipped.map((b) => ({ rows: `${b.fromRow}-${b.toRow}`, reason: b.reason.slice(0, 200) })),
    skipped_rows: (summary.perSheet[p.name]?.skippedRows ?? []).slice(0, 50),
  }));
}
