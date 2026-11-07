/**
 * Pure helpers for the Excel/CSV import: file checks, column detection and
 * value normalisation. The database validates every row again; this code only
 * prepares the data and gives early feedback.
 */
import { parseDateQuery } from "./travelQuery";

export const IMPORT_FIELDS = [
  { key: "employee_code", label: "Employee ID" },
  { key: "employee_name", label: "Employee name" },
  { key: "department", label: "Department" },
  { key: "departure_date", label: "Travel date" },
  { key: "return_date", label: "Return date" },
  { key: "origin", label: "From" },
  { key: "destination", label: "To" },
  { key: "provider", label: "Airline / provider" },
  { key: "booking_reference", label: "PNR / booking reference" },
  { key: "ticket_number", label: "Ticket number" },
  { key: "amount", label: "Amount" },
  { key: "currency", label: "Currency" },
  { key: "booking_type", label: "Travel mode" },
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];
export type ColumnMapping = Record<string, ImportField | "">; // header -> field ("" = ignore)
export type CellValue = string | number | boolean | Date | null | undefined;

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 5000;

const ALIASES: Record<ImportField, string[]> = {
  employee_code: ["employee id", "employee code", "emp id", "emp code", "empid", "staff id", "employee number", "emp no", "employee no", "badge id"],
  employee_name: ["employee name", "employee", "passenger name", "passenger", "name", "full name", "emp name", "staff name", "traveler name", "traveller name", "traveller", "traveler"],
  department: ["department", "dept", "division", "business unit", "team", "department name"],
  departure_date: ["travel date", "departure date", "date of travel", "journey date", "depart date", "date", "start date", "flight date", "onward date"],
  return_date: ["return date", "arrival date", "end date", "trip end date", "return"],
  origin: ["from", "origin", "source", "from location", "departure city", "from city", "departure location", "source station", "sector from"],
  destination: ["to", "destination", "to location", "arrival city", "to city", "arrival location", "dest", "destination city", "sector to"],
  provider: ["airline", "provider", "carrier", "vendor", "operator", "service provider", "airline name"],
  booking_reference: ["pnr", "pnr no", "pnr number", "booking reference", "booking ref", "reference", "confirmation number", "booking id"],
  ticket_number: ["ticket number", "ticket no", "ticket", "e ticket", "eticket", "ticket id", "ticket ref"],
  amount: ["amount", "cost", "fare", "price", "total cost", "ticket cost", "total amount", "total fare", "amount inr", "amount rs"],
  currency: ["currency", "curr"],
  booking_type: ["travel mode", "mode", "mode of travel", "transport", "travel type", "booking type"],
};

export function normalizeHeader(h: string): string {
  return String(h ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Suggests a field for each header. Each field is used at most once. */
export function detectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<ImportField>();
  for (const h of headers) mapping[h] = "";
  // Exact alias matches first, so "From" is not taken by a looser rule.
  for (const h of headers) {
    const n = normalizeHeader(h);
    for (const f of Object.keys(ALIASES) as ImportField[]) {
      if (!used.has(f) && ALIASES[f].includes(n)) {
        mapping[h] = f;
        used.add(f);
        break;
      }
    }
  }
  return mapping;
}

export function missingRequired(mapping: ColumnMapping): string[] {
  const fields = new Set(Object.values(mapping));
  const missing: string[] = [];
  if (!fields.has("employee_code") && !fields.has("employee_name")) missing.push("Employee ID or employee name");
  if (!fields.has("departure_date")) missing.push("Travel date");
  if (!fields.has("origin")) missing.push("From");
  if (!fields.has("destination")) missing.push("To");
  return missing;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Converts a spreadsheet cell to YYYY-MM-DD when possible; otherwise returns the text unchanged. */
export function normalizeDateCell(v: CellValue): string {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  }
  if (typeof v === "number") {
    // Excel serial date (days since 1899-12-30). Accept a sensible range only.
    if (v > 20000 && v < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
    return String(v);
  }
  const text = String(v).trim();
  // "14-Oct-2026" / "14-Oct-26" style
  const m = text.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{2}|\d{4})$/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return parseDateQuery(`${m[1]} ${m[2]} ${year}`) ?? text;
  }
  // Drop a time part such as "2026-10-14 10:30" or "14/10/2026 09:00"
  const withoutTime = text.replace(/[ T]\d{1,2}:\d{2}(:\d{2})?(\s?[AaPp][Mm])?$/, "");
  return parseDateQuery(withoutTime) ?? text;
}

export function cellToText(v: CellValue, max = 200): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return normalizeDateCell(v);
  return String(v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

/** Applies the mapping to raw rows. Every value is sent as a string. */
export function mapRows(headers: string[], rows: CellValue[][], mapping: ColumnMapping): Array<Record<string, string>> {
  return rows.map((row) => {
    const out: Record<string, string> = {};
    headers.forEach((h, i) => {
      const field = mapping[h];
      if (!field) return;
      const cell = row[i];
      out[field] = field === "departure_date" || field === "return_date" ? normalizeDateCell(cell) : cellToText(cell);
    });
    return out;
  });
}

export function isBlankRow(row: CellValue[]): boolean {
  return row.every((c) => c === null || c === undefined || String(c).trim() === "");
}

export type FileCheck = { ok: true; kind: "csv" | "xlsx" } | { ok: false; error: string };

/** Checks name, size and the file's first bytes (an .xlsx is a ZIP; a CSV is text). */
export function checkImportFile(name: string, size: number, firstBytes: Uint8Array): FileCheck {
  const lower = name.toLowerCase();
  const kind = lower.endsWith(".xlsx") ? "xlsx" : lower.endsWith(".csv") ? "csv" : null;
  if (!kind) return { ok: false, error: "Please upload a .xlsx or .csv file. (Old .xls files: open in Excel and save as .xlsx.)" };
  if (size === 0) return { ok: false, error: "The file is empty." };
  if (size > MAX_FILE_BYTES) return { ok: false, error: "The file is larger than 5 MB. Split it into smaller files." };
  if (kind === "xlsx") {
    const isZip = firstBytes[0] === 0x50 && firstBytes[1] === 0x4b && firstBytes[2] === 0x03 && firstBytes[3] === 0x04;
    if (!isZip) return { ok: false, error: "This does not look like a real Excel (.xlsx) file." };
  } else if (firstBytes.includes(0)) {
    return { ok: false, error: "This does not look like a text CSV file." };
  }
  return { ok: true, kind };
}

/** A small example sheet so the travel desk knows which columns to use. */
export const SAMPLE_UPLOAD_HEADERS = ["Employee ID", "Employee Name", "Department", "Travel Date", "Return Date", "From", "To", "Travel Mode", "Airline", "PNR", "Ticket Number", "Amount", "Currency"];
export const SAMPLE_UPLOAD_ROWS: string[][] = [
  ["EMP001", "Arun Kumar", "Engineering", "2026-10-14", "2026-10-16", "Chennai", "Delhi", "Flight", "IndiGo", "AB12CD", "0981234567890", "8450", "INR"],
  ["EMP002", "Bina Rao", "Finance", "2026-10-21", "", "Mumbai", "Pune", "Train", "IRCTC", "PNR4455", "", "1250", "INR"],
];
