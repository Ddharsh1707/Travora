import * as XLSX from "xlsx";
import type { ImportedRecordResponse, EmployeeRecord } from "./api";

const xlsx: any = XLSX;
const ssfLib: any = (xlsx as Record<string, any>).SSF || (xlsx as Record<string, any>)["default"]?.SSF;

export interface ClientParsedSpreadsheet {
  sheetNames: string[];
  activeSheet: string;
  availableHeaders: string[];
  columnMapping: Record<string, string>;
  records: ImportedRecordResponse[];
  totalRows: number;
  validRows: number;
  errorRows: number;
}

const HONORIFIC_TITLES = new Set([
  "MR",
  "MRS",
  "MS",
  "MISS",
  "MSTR",
  "MASTER",
  "DR",
  "PROF",
  "CAPT",
  "COL",
  "REV",
]);

/**
 * Normalizes airline GDS slash notation, inverted comma notation, and strips honorifics:
 * - "DANGETI/SURESH BABU MR" -> "Suresh Babu Dangeti"
 * - "KUKREJA, ANIL" -> "Anil Kukreja"
 * - "MR. JOHN DOE" -> "John Doe"
 * - "DOE/JOHN" -> "John Doe"
 */
export function normalizePassengerName(raw?: string | null): string {
  if (!raw) return "";
  let s = String(raw).trim();
  if (!s) return "";

  if (s.includes("/")) {
    const parts = s.split("/");
    const lastName = parts[0].trim();
    let firstAndMiddle = parts.slice(1).join(" ").trim();
    const words = firstAndMiddle.split(/\s+/);
    if (words.length > 1) {
      const lastToken = words[words.length - 1].replace(/\./g, "").toUpperCase();
      if (HONORIFIC_TITLES.has(lastToken)) {
        words.pop();
        firstAndMiddle = words.join(" ");
      }
    }
    s = `${firstAndMiddle} ${lastName}`.trim();
  } else if (s.includes(",")) {
    const parts = s.split(",");
    const lastName = parts[0].trim();
    let firstAndMiddle = parts.slice(1).join(" ").trim();
    const words = firstAndMiddle.split(/\s+/);
    if (words.length > 1) {
      const lastToken = words[words.length - 1].replace(/\./g, "").toUpperCase();
      if (HONORIFIC_TITLES.has(lastToken)) {
        words.pop();
        firstAndMiddle = words.join(" ");
      }
    }
    s = `${firstAndMiddle} ${lastName}`.trim();
  } else {
    const words = s.split(/\s+/);
    if (words.length > 1 && HONORIFIC_TITLES.has(words[0].replace(/\./g, "").toUpperCase())) {
      words.shift();
      s = words.join(" ");
    }
    if (words.length > 1 && HONORIFIC_TITLES.has(words[words.length - 1].replace(/\./g, "").toUpperCase())) {
      words.pop();
      s = words.join(" ");
    }
  }

  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length === 1 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

/**
 * Splits sector/route strings like "HYD-DEL", "DEL/BOM", "BOM TO BLR", "HYD - BLR"
 */
export function splitSector(sectorStr?: string | null): { fromLocation: string; toLocation: string } | null {
  if (!sectorStr) return null;
  const s = String(sectorStr).trim();
  if (!s) return null;

  // Order from longest/most specific to single char separators
  const separators = ["->", "→", " to ", " TO ", " To ", " - ", "-", "—", "/"];
  for (const sep of separators) {
    if (s.includes(sep)) {
      const parts = s.split(sep);
      if (parts.length >= 2) {
        const from = parts[0].trim().toUpperCase();
        const to = parts[parts.length - 1].trim().toUpperCase();
        if (from && to) {
          return { fromLocation: from, toLocation: to };
        }
      }
    }
  }
  return null;
}

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

/**
 * Parses dates from Date objects, Excel serial numbers, or formatted strings:
 * - 45565 -> 2024-09-01
 * - "01 Sep 26" -> 2026-09-01
 * - "15/09/2026" or "15.09.2026" -> 2026-09-15
 * - "2026-09-15" -> 2026-09-15
 */
export function parseExcelDate(val: any): string | null {
  if (val == null) return null;

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return val.toISOString().split("T")[0];
  }

  // Handle Excel serial date numbers
  if (typeof val === "number" && val > 20000 && val < 90000) {
    try {
      const ssf = ssfLib || xlsx.SSF;
      if (ssf?.parse_date_code) {
        const parsed = ssf.parse_date_code(val);
        if (parsed && parsed.y && parsed.m && parsed.d) {
          const yyyy = String(parsed.y).padStart(4, "0");
          const mm = String(parsed.m).padStart(2, "0");
          const dd = String(parsed.d).padStart(2, "0");
          return `${yyyy}-${mm}-${dd}`;
        }
      }
    } catch {}
  }

  const s = String(val).trim();
  if (!s) return null;

  // ISO format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }

  // "01 Sep 26" or "1 Sep 2026" or "01-Sep-2026"
  const m1 = s.match(/^(\d{1,2})[\s\-\/\.]*([A-Za-z]{3,9})[\s\-\/\.]*(\d{2,4})$/);
  if (m1) {
    const day = parseInt(m1[1], 10);
    const monStr = m1[2].toLowerCase();
    const month = MONTH_MAP[monStr];
    let year = parseInt(m1[3], 10);
    if (year < 100) year += 2000;
    if (month && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // "15/09/2026" or "15-09-2026" or "15.09.26" (DD/MM/YYYY)
  const m2 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m2) {
    const d1 = parseInt(m2[1], 10);
    const d2 = parseInt(m2[2], 10);
    let year = parseInt(m2[3], 10);
    if (year < 100) year += 2000;
    // Assume DD/MM/YYYY
    const day = d1;
    const month = d2;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const d = new Date(s);
  if (!isNaN(d.getTime()) && d.getFullYear() >= 1990 && d.getFullYear() <= 2100) {
    return d.toISOString().split("T")[0];
  }

  return s;
}

/**
 * Parses numeric cost/fare amounts, stripping currency signs and commas
 */
export function parseCost(val: any): number | null {
  if (val == null) return null;
  if (typeof val === "number") return isNaN(val) ? null : Math.round(val * 100) / 100;

  const s = String(val).replace(/[\$,₹€£\s]/g, "").trim();
  if (!s) return null;
  const num = parseFloat(s);
  return isNaN(num) ? null : Math.round(num * 100) / 100;
}

/**
 * Checks if a row is a summary/footer row (e.g. TOTAL, GRAND TOTAL)
 */
export function isSummaryRow(rowCells: string[]): boolean {
  for (const cell of rowCells) {
    const normalized = cell.trim().toUpperCase();
    if (
      normalized === "TOTAL" ||
      normalized === "GRAND TOTAL" ||
      normalized === "SUB TOTAL" ||
      normalized === "SUBTOTAL" ||
      normalized.startsWith("TOTAL ") ||
      normalized.startsWith("GRAND TOTAL ")
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Reconstructs missing record fields from raw row JSON snapshot when available
 */
export function recoverFieldsFromRawRow(rawRowData?: string | null): Partial<ImportedRecordResponse> | null {
  if (!rawRowData) return null;
  try {
    const map = typeof rawRowData === "string" ? JSON.parse(rawRowData) : rawRowData;
    if (!map || typeof map !== "object") return null;

    let rawPassenger = "";
    let rawEmpId = "";
    let rawDate = "";
    let fromLoc = "";
    let toLoc = "";
    let ticketRef = "";
    let provider = "";
    let cost: number | null = null;

    for (const [key, rawVal] of Object.entries(map)) {
      const val = String(rawVal || "").trim();
      if (!val) continue;
      const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();

      // Check if value is sector (e.g. HYD-DEL)
      const sector = splitSector(val);
      if (sector && !fromLoc) {
        fromLoc = sector.fromLocation;
        toLoc = sector.toLocation;
      }

      // Check for passenger name (or airline GDS format like DANGETI/SURESH BABU MR)
      if (!rawPassenger) {
        if (
          normKey.includes("pax") ||
          normKey.includes("passenger") ||
          (normKey.includes("name") && !normKey.includes("file") && !normKey.includes("company"))
        ) {
          rawPassenger = val;
        } else if (val.includes("/") && /[A-Z]+\/[A-Z]+/.test(val)) {
          rawPassenger = val;
        }
      }

      // Check for employee code
      if (!rawEmpId && (normKey === "emp id" || normKey === "ps no" || normKey === "employee id")) {
        rawEmpId = val;
      }

      // Check for date
      if (!rawDate) {
        if (normKey.includes("date") || normKey === "dt") {
          rawDate = parseExcelDate(val) || val;
        } else if (
          /^\d{1,2}[\s\-\/\.]+[A-Za-z]{3}[\s\-\/\.]+\d{2,4}$/.test(val) ||
          /^\d{4}-\d{2}-\d{2}$/.test(val)
        ) {
          rawDate = parseExcelDate(val) || val;
        }
      }

      // Check for ticket
      if (!ticketRef && (normKey.includes("ticket") || normKey.includes("tkt") || normKey.includes("pnr"))) {
        ticketRef = val;
      }

      // Check for airline
      if (!provider && (normKey.includes("airline") || normKey.includes("carrier"))) {
        provider = val;
      }

      // Check for cost
      if (
        cost == null &&
        (normKey.includes("amount") ||
          normKey.includes("fare") ||
          normKey.includes("cost") ||
          normKey.includes("net"))
      ) {
        cost = parseCost(val);
      }
    }

    const normName = normalizePassengerName(rawPassenger);
    return {
      rawEmployeeName: normName || rawPassenger || undefined,
      rawEmployeeIdentifier: rawEmpId || undefined,
      travelDate: rawDate || undefined,
      fromLocation: fromLoc || undefined,
      toLocation: toLoc || undefined,
      ticketReference: ticketRef || undefined,
      provider: provider || undefined,
      cost: cost,
    };
  } catch {
    return null;
  }
}

/**
 * Computes header row candidate score to distinguish actual table headers from
 * top title banners (e.g. "AIR TICKETS") or blank rows.
 */
function scoreHeaderCandidate(rowCells: string[]): number {
  const nonEmpty = rowCells.filter((c) => c && c.trim().length > 0);
  if (nonEmpty.length < 2) return -100;

  let score = 0;
  for (const cell of nonEmpty) {
    const norm = cell.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
    // High-confidence travel column headers
    if (norm === "pax name" || norm === "passenger name" || norm === "passenger" || norm === "pax" || norm === "traveler") score += 5;
    else if (norm === "sector" || norm === "route" || norm === "itinerary" || norm === "from to") score += 5;
    else if (norm === "ticket no" || norm === "ticket number" || norm === "tkt no" || norm === "pnr") score += 5;
    else if (norm === "net amount" || norm === "fare" || norm === "amount" || norm === "cost" || norm === "gross amount") score += 4;
    else if (norm === "date" || norm === "travel date" || norm === "departure date" || norm === "journey date") score += 4;
    else if (norm === "airline" || norm === "carrier" || norm === "flight no") score += 3;
    else if (norm === "sl no" || norm === "s no" || norm === "s no." || norm === "sl.no" || norm === "sr no") score += 3;
    else if (norm === "emp id" || norm === "employee id" || norm === "ps no" || norm === "staff id" || norm === "emp code") score += 4;
    else if (norm.includes("name") || norm.includes("date") || norm.includes("from") || norm.includes("to")) score += 2;
  }
  return score;
}

/**
 * Automatically maps detected header names to standard Trapple schema fields
 */
export function buildSuggestedMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};

  for (const h of headers) {
    const norm = h.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();

    // Passenger / Employee Name
    if (!mapping.employeeName) {
      if (
        norm === "pax name" ||
        norm === "passenger name" ||
        norm === "passenger" ||
        norm === "pax" ||
        norm === "traveler" ||
        norm === "traveller" ||
        norm === "employee name" ||
        (norm.includes("name") && !norm.includes("project") && !norm.includes("company") && !norm.includes("airline"))
      ) {
        mapping.employeeName = h;
      }
    }

    // Sector / Route
    if (!mapping.sector) {
      if (
        norm === "sector" ||
        norm === "route" ||
        norm === "itinerary" ||
        norm === "from to" ||
        norm === "sector route"
      ) {
        mapping.sector = h;
      }
    }

    // Origin
    if (!mapping.fromLocation) {
      if (norm === "origin" || norm === "from" || norm === "from location" || norm === "origin city") {
        mapping.fromLocation = h;
      }
    }

    // Destination
    if (!mapping.toLocation) {
      if (norm === "destination" || norm === "to" || norm === "to location" || norm === "destination city") {
        mapping.toLocation = h;
      }
    }

    // Travel Date
    if (!mapping.travelDate) {
      if (
        norm === "date" ||
        norm === "travel date" ||
        norm === "departure date" ||
        norm === "journey date" ||
        norm === "dt"
      ) {
        mapping.travelDate = h;
      }
    }

    // Ticket Reference
    if (!mapping.ticketReference) {
      if (
        norm === "ticket no" ||
        norm === "ticket number" ||
        norm === "tkt no" ||
        norm === "ticket" ||
        norm === "pnr" ||
        norm === "booking ref"
      ) {
        mapping.ticketReference = h;
      }
    }

    // Cost / Fare Amount
    if (!mapping.cost) {
      if (
        norm === "net amount" ||
        norm === "amount" ||
        norm === "fare" ||
        norm === "cost" ||
        norm === "total amount" ||
        norm === "gross amount" ||
        norm === "ticket fare"
      ) {
        mapping.cost = h;
      }
    }

    // Airline / Provider
    if (!mapping.provider) {
      if (norm === "airline" || norm === "carrier" || norm === "provider" || norm === "airlines") {
        mapping.provider = h;
      }
    }

    // Employee ID
    if (!mapping.employeeId) {
      if (
        norm === "emp id" ||
        norm === "employee id" ||
        norm === "ps no" ||
        norm === "psno" ||
        norm === "staff id" ||
        norm === "emp code" ||
        norm === "employee code"
      ) {
        mapping.employeeId = h;
      }
    }

    // Department
    if (!mapping.department) {
      if (norm === "department" || norm === "dept" || norm === "dept name") {
        mapping.department = h;
      }
    }
  }

  return mapping;
}

/**
 * Full client-side spreadsheet parser that extracts rows, headers, and normalized records
 */
export async function parseSpreadsheetClient(
  fileOrBuffer: File | ArrayBuffer,
  options?: {
    sheet?: string;
    customMapping?: Record<string, string>;
    employees?: EmployeeRecord[];
  }
): Promise<ClientParsedSpreadsheet> {
  let arrayBuffer: ArrayBuffer;
  if (fileOrBuffer instanceof ArrayBuffer) {
    arrayBuffer = fileOrBuffer;
  } else {
    arrayBuffer = await fileOrBuffer.arrayBuffer();
  }

  const readFn = xlsx.read || (xlsx as any).default?.read;
  const workbook = readFn(arrayBuffer, {
    type: "array",
    cellDates: true,
    cellNF: false,
    cellText: true,
  });

  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) {
    throw new Error("The uploaded spreadsheet contains no sheets.");
  }

  const activeSheet = options?.sheet && sheetNames.includes(options.sheet) ? options.sheet : sheetNames[0];
  const worksheet = workbook.Sheets[activeSheet];
  if (!worksheet) {
    throw new Error(`Sheet "${activeSheet}" could not be read.`);
  }

  // Convert raw sheet data into 2D array of strings
  const utils = xlsx.utils || (xlsx as any).default?.utils;
  const rawRows: string[][] = utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  }) as string[][];

  if (!rawRows || rawRows.length === 0) {
    throw new Error("Spreadsheet is completely empty.");
  }

  // Scan for best header row up to row 30
  let bestHeaderIndex = -1;
  let maxScore = -1;
  const maxScanRows = Math.min(30, rawRows.length);

  for (let r = 0; r < maxScanRows; r++) {
    const rowCells = rawRows[r] || [];
    const score = scoreHeaderCandidate(rowCells);
    if (score > maxScore) {
      maxScore = score;
      bestHeaderIndex = r;
    }
  }

  // Fallback to first row with at least 2 non-empty cells
  if (bestHeaderIndex === -1 || maxScore <= 0) {
    for (let r = 0; r < maxScanRows; r++) {
      const nonEmpty = (rawRows[r] || []).filter((c) => c && String(c).trim().length > 0);
      if (nonEmpty.length >= 2) {
        bestHeaderIndex = r;
        break;
      }
    }
  }

  if (bestHeaderIndex === -1) {
    bestHeaderIndex = 0;
  }

  const rawHeaderRow = rawRows[bestHeaderIndex] || [];
  const availableHeaders: string[] = [];
  const seenHeaders = new Set<string>();

  for (let c = 0; c < rawHeaderRow.length; c++) {
    let headerName = String(rawHeaderRow[c] || "").trim();
    if (!headerName) {
      headerName = `Column_${c + 1}`;
    }
    let uniqueName = headerName;
    let counter = 2;
    while (seenHeaders.has(uniqueName.toLowerCase())) {
      uniqueName = `${headerName}_${counter++}`;
    }
    seenHeaders.add(uniqueName.toLowerCase());
    availableHeaders.push(uniqueName);
  }

  const mapping = options?.customMapping || buildSuggestedMapping(availableHeaders);
  const employeeLookup = new Map<string, EmployeeRecord>();
  if (options?.employees) {
    for (const emp of options.employees) {
      if (emp.name) employeeLookup.set(emp.name.toLowerCase().trim(), emp);
      if (emp.employeeId) employeeLookup.set(emp.employeeId.toLowerCase().trim(), emp);
    }
  }

  const records: ImportedRecordResponse[] = [];
  let validCount = 0;
  let errorCount = 0;

  for (let r = bestHeaderIndex + 1; r < rawRows.length; r++) {
    const rowCells = rawRows[r] || [];
    const nonEmpty = rowCells.filter((c) => c != null && String(c).trim().length > 0);
    if (nonEmpty.length === 0) continue; // Skip blank line

    if (isSummaryRow(rowCells.map((c) => String(c || "")))) {
      continue; // Skip TOTAL / GRAND TOTAL
    }

    // Build row map
    const rowMap: Record<string, string> = {};
    for (let c = 0; c < availableHeaders.length; c++) {
      const header = availableHeaders[c];
      const val = rowCells[c] != null ? String(rowCells[c]).trim() : "";
      rowMap[header] = val;
    }

    // Extract passenger name
    let rawPassenger = "";
    if (mapping.employeeName && rowMap[mapping.employeeName]) {
      rawPassenger = rowMap[mapping.employeeName];
    } else {
      // Dynamic fallback for passenger column
      for (const [col, val] of Object.entries(rowMap)) {
        const norm = col.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
        if (
          (norm.includes("pax") || norm.includes("passenger") || norm.includes("traveler") || norm.includes("traveller") ||
           (norm.includes("name") && !norm.includes("project") && !norm.includes("company") && !norm.includes("airline"))) &&
          val
        ) {
          rawPassenger = val;
          break;
        }
      }
    }

    const normalizedName = normalizePassengerName(rawPassenger);

    // Extract employee code / ID
    let rawEmployeeId = "";
    if (mapping.employeeId && rowMap[mapping.employeeId]) {
      rawEmployeeId = rowMap[mapping.employeeId];
    } else {
      for (const [col, val] of Object.entries(rowMap)) {
        const norm = col.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
        if ((norm === "emp id" || norm === "ps no" || norm === "employee id" || norm === "emp code") && val) {
          rawEmployeeId = val;
          break;
        }
      }
    }

    // Extract Date
    let rawDateVal: any = null;
    if (mapping.travelDate && rowMap[mapping.travelDate]) {
      rawDateVal = rowMap[mapping.travelDate];
    } else {
      for (const [col, val] of Object.entries(rowMap)) {
        const norm = col.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
        if ((norm === "date" || norm === "travel date" || norm === "journey date") && val) {
          rawDateVal = val;
          break;
        }
      }
    }
    const formattedDate = parseExcelDate(rawDateVal);

    // Extract Route / Sector
    let fromLocation = "";
    let toLocation = "";
    if (mapping.sector && rowMap[mapping.sector]) {
      const split = splitSector(rowMap[mapping.sector]);
      if (split) {
        fromLocation = split.fromLocation;
        toLocation = split.toLocation;
      }
    } else if (mapping.fromLocation && mapping.toLocation) {
      fromLocation = (rowMap[mapping.fromLocation] || "").toUpperCase().trim();
      toLocation = (rowMap[mapping.toLocation] || "").toUpperCase().trim();
    } else {
      // Fallback sector scan
      for (const [col, val] of Object.entries(rowMap)) {
        const norm = col.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
        if ((norm.includes("sector") || norm.includes("route") || norm.includes("itinerary")) && val) {
          const split = splitSector(val);
          if (split) {
            fromLocation = split.fromLocation;
            toLocation = split.toLocation;
            break;
          }
        }
      }
    }

    // Extract Ticket Reference
    let ticketRef = "";
    if (mapping.ticketReference && rowMap[mapping.ticketReference]) {
      ticketRef = rowMap[mapping.ticketReference];
    } else {
      for (const [col, val] of Object.entries(rowMap)) {
        const norm = col.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
        if ((norm.includes("ticket") || norm.includes("tkt") || norm.includes("pnr")) && val) {
          ticketRef = val;
          break;
        }
      }
    }

    // Extract Provider / Airline
    let provider = "";
    if (mapping.provider && rowMap[mapping.provider]) {
      provider = rowMap[mapping.provider];
    } else {
      for (const [col, val] of Object.entries(rowMap)) {
        const norm = col.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
        if ((norm.includes("airline") || norm.includes("carrier")) && val) {
          provider = val;
          break;
        }
      }
    }

    // Extract Cost
    let rawCost: any = null;
    if (mapping.cost && rowMap[mapping.cost]) {
      rawCost = rowMap[mapping.cost];
    } else {
      for (const [col, val] of Object.entries(rowMap)) {
        const norm = col.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
        if ((norm.includes("amount") || norm.includes("fare") || norm.includes("cost")) && val) {
          rawCost = val;
          break;
        }
      }
    }
    const costNumber = parseCost(rawCost);

    // Validate
    const validationErrors: string[] = [];
    if (!normalizedName && !rawPassenger && !rawEmployeeId) {
      validationErrors.push("Missing employee name or ID");
    }
    if (!formattedDate) {
      validationErrors.push("Missing travel date");
    }
    if (!fromLocation || !toLocation) {
      validationErrors.push("Missing route/sector details (Origin or Destination)");
    }

    // Attempt employee match
    let matchedEmp: EmployeeRecord | undefined;
    if (rawEmployeeId) {
      matchedEmp = employeeLookup.get(rawEmployeeId.toLowerCase());
    }
    if (!matchedEmp && normalizedName) {
      matchedEmp = employeeLookup.get(normalizedName.toLowerCase());
    }

    const isValid = validationErrors.length === 0;
    const status: ImportedRecordResponse["status"] = matchedEmp
      ? "MATCHED"
      : isValid
      ? "VALID"
      : "INVALID";

    if (isValid) validCount++;
    else errorCount++;

    const record: ImportedRecordResponse = {
      id: records.length + 1,
      importBatchId: 0,
      rawEmployeeIdentifier: rawEmployeeId || null,
      rawEmployeeName: normalizedName || rawPassenger || null,
      matchedEmployeeId: matchedEmp?.id || null,
      matchedEmployeeName: matchedEmp?.name || null,
      matchedEmployeeCode: matchedEmp?.employeeId || null,
      travelDate: formattedDate || null,
      returnDate: null,
      fromLocation: fromLocation || null,
      toLocation: toLocation || null,
      ticketReference: ticketRef || null,
      department: mapping.department ? rowMap[mapping.department] || null : null,
      travelMode: "FLIGHT",
      provider: provider || null,
      cost: costNumber,
      projectName: null,
      status,
      matchConfidence: matchedEmp ? "HIGH" : undefined,
      validationErrors,
      sourceRowNumber: r + 1,
      imported: false,
    };

    records.push(record);
  }

  return {
    sheetNames,
    activeSheet,
    availableHeaders,
    columnMapping: mapping,
    records,
    totalRows: records.length,
    validRows: validCount,
    errorRows: errorCount,
  };
}
