/**
 * Employees uploading their own expenses from an Excel or CSV sheet.
 *
 * Pure helpers (no network): find the header row, match columns, turn each
 * row into a claim and mark rows that are invalid or already claimed. The
 * database checks every saved claim again (owner, amount, date, project).
 */
import { cellToText, isBlankRow, normalizeDateCell, normalizeHeader, type CellValue } from "./importParser";
import { isValidIsoDate } from "./travelQuery";
import { CATEGORY_LABELS, PAYMENT_METHODS, type ExpenseCategory } from "./expenses";

export const MAX_EXPENSE_ROWS = 500;

export type ExpenseField = "date" | "category" | "description" | "amount" | "currency" | "payment" | "project" | "origin" | "destination";

export const EXPENSE_FIELD_LABELS: Record<ExpenseField, string> = {
  date: "Date",
  category: "Category",
  description: "Description",
  amount: "Amount",
  currency: "Currency",
  payment: "Paid by",
  project: "Project",
  origin: "From",
  destination: "To",
};

const ALIASES: Record<ExpenseField, string[]> = {
  date: ["date", "expense date", "bill date", "invoice date", "txn date", "transaction date", "travel date", "date of expense", "dt"],
  category: ["category", "type", "expense type", "expense head", "head", "expense category", "nature of expense", "mode"],
  description: ["description", "details", "particulars", "purpose", "narration", "remarks", "expense details", "item", "notes"],
  amount: ["amount", "total", "cost", "value", "amount inr", "amount rs", "amount in rs", "total amount", "inr", "rs", "bill amount", "claim amount"],
  currency: ["currency", "curr"],
  payment: ["paid by", "payment", "payment mode", "mode of payment", "payment method", "paid via"],
  project: ["project", "project name", "site", "cost centre", "cost center", "job", "project code"],
  origin: ["from", "origin", "from place", "source", "start"],
  destination: ["to", "destination", "to place", "end"],
};

/** Matches each column to a field. Each field is used at most once; unknown columns are ignored. */
export function detectExpenseColumns(headers: string[]): Record<number, ExpenseField> {
  const out: Record<number, ExpenseField> = {};
  const used = new Set<ExpenseField>();
  headers.forEach((h, i) => {
    const n = normalizeHeader(h);
    if (!n) return;
    for (const f of Object.keys(ALIASES) as ExpenseField[]) {
      if (!used.has(f) && ALIASES[f].includes(n)) {
        out[i] = f;
        used.add(f);
        return;
      }
    }
  });
  return out;
}

/** The header is the first of the top 15 rows that has both a date and an amount column. */
export function findHeaderRow(rows: CellValue[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const fields = Object.values(detectExpenseColumns(rows[i].map((c) => cellToText(c))));
    if (fields.includes("date") && fields.includes("amount")) return i;
  }
  return -1;
}

const CATEGORY_WORDS: Array<[RegExp, ExpenseCategory]> = [
  [/\b(flight|air|airfare|airline|plane)\b/, "airfare"],
  [/\b(train|rail|railway|irctc)\b/, "train"],
  [/\bbus\b/, "bus"],
  [/\b(cab|taxi|uber|ola|rapido)\b/, "cab"],
  [/\b(hotel|stay|lodging|lodge|accommodation|room)\b/, "hotel"],
  [/\b(food|meal|meals|lunch|dinner|breakfast|snacks|tea)\b/, "meals"],
  [/\b(auto|metro|local|conveyance|parking|toll|fuel|petrol|diesel)\b/, "local_transport"],
  [/\b(visa|passport)\b/, "visa"],
  [/\b(phone|mobile|internet|data|recharge|sim)\b/, "communication"],
];

/** "Lunch", "Taxi", "local_transport" or "Cab / taxi" → a known category. Unknown → other. */
export function toCategory(text: string): ExpenseCategory {
  const t = text.toLowerCase().trim();
  if (!t) return "other";
  for (const [key, label] of Object.entries(CATEGORY_LABELS)) {
    if (t === key || t === label.toLowerCase()) return key as ExpenseCategory;
  }
  for (const [re, cat] of CATEGORY_WORDS) if (re.test(t)) return cat;
  return "other";
}

function toPayment(text: string): (typeof PAYMENT_METHODS)[number] {
  const t = text.toLowerCase();
  if (/company|corporate|card/.test(t) && !/personal|own|self/.test(t)) return "company_card";
  if (/cash/.test(t)) return "cash";
  if (/upi|gpay|phonepe|paytm/.test(t)) return "upi";
  return "personal";
}

/** "₹1,234.50", "1234", "Rs. 1,234/-" → 1234.5. Anything else → null. */
export function toAmount(v: CellValue): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  const t = cellToText(v).replace(/(rs\.?|inr|₹|\/-)/gi, "").replace(/,/g, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Math.round(Number(t) * 100) / 100;
}

export type ProjectChoice = { id: string; name: string; code: string | null };

export type ExpenseLine = {
  row: number;            // 1-based row number in the sheet
  expense_date: string;
  category: ExpenseCategory;
  description: string;
  amount: number | null;
  currency: string;
  payment_method: (typeof PAYMENT_METHODS)[number];
  project_id: string | null;
  project_text: string;
  origin: string;
  destination: string;
  status: "ok" | "error" | "duplicate";
  problems: string[];
};

export type ExistingClaim = { expense_date: string; amount: number | string; description: string; status?: string };

const claimKey = (date: string, amount: number | string | null, description: string) =>
  `${date}|${Number(amount ?? 0).toFixed(2)}|${description.toLowerCase().replace(/\s+/g, " ").trim()}`;

/**
 * Reads a sheet into claim lines. Rows that are blank or look like a total
 * line are skipped. A row is a duplicate when the same date, amount and
 * description is already in the file or already claimed (and not withdrawn).
 */
export function parseExpenseSheet(
  rows: CellValue[][],
  opts: { projects?: ProjectChoice[]; existing?: ExistingClaim[]; today?: string } = {},
): { header: number; columns: Record<number, ExpenseField>; lines: ExpenseLine[]; error?: string } {
  const header = findHeaderRow(rows);
  if (header < 0) return { header, columns: {}, lines: [], error: "Could not find the header row. The sheet needs at least a Date column and an Amount column." };
  const columns = detectExpenseColumns(rows[header].map((c) => cellToText(c)));
  const col = (f: ExpenseField) => Object.entries(columns).find(([, v]) => v === f)?.[0];
  const idx = Object.fromEntries((Object.keys(EXPENSE_FIELD_LABELS) as ExpenseField[]).map((f) => [f, col(f)])) as Record<ExpenseField, string | undefined>;
  const get = (row: CellValue[], f: ExpenseField): CellValue => (idx[f] === undefined ? undefined : row[Number(idx[f])]);

  const projects = opts.projects ?? [];
  const findProject = (text: string) => {
    const t = text.toLowerCase().trim();
    if (!t) return null;
    return projects.find((p) => p.name.toLowerCase().trim() === t || (p.code ?? "").toLowerCase().trim() === t) ?? null;
  };
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const seen = new Set((opts.existing ?? []).filter((e) => e.status !== "withdrawn").map((e) => claimKey(e.expense_date, e.amount, e.description)));

  const lines: ExpenseLine[] = [];
  for (let r = header + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || isBlankRow(row)) continue;
    const descRaw = cellToText(get(row, "description"), 500);
    const firstText = row.map((c) => cellToText(c)).join(" ").toLowerCase();
    if (/^\s*(grand\s+)?total\b/.test(firstText) || (/\btotal\b/.test(firstText) && !normalizeDateCell(get(row, "date")))) continue;

    const problems: string[] = [];
    const date = normalizeDateCell(get(row, "date"));
    if (!isValidIsoDate(date)) problems.push("Date is missing or not a date");
    else if (date > today) problems.push("Date is in the future");
    const amount = toAmount(get(row, "amount"));
    if (amount === null) problems.push("Amount is missing or not a number");
    else if (amount <= 0) problems.push("Amount must be more than zero");
    else if (amount > 10_000_000) problems.push("Amount is too large");
    const categoryText = cellToText(get(row, "category"), 80);
    const category = toCategory(categoryText || descRaw);
    const origin = cellToText(get(row, "origin"), 120);
    const destination = cellToText(get(row, "destination"), 120);
    const description = descRaw
      || [categoryText || CATEGORY_LABELS[category], origin && destination ? `${origin} to ${destination}` : origin || destination].filter(Boolean).join(" ").slice(0, 500);
    const currencyText = cellToText(get(row, "currency"), 10).toUpperCase();
    const currency = /^[A-Z]{3}$/.test(currencyText) ? currencyText : "INR";
    if (currencyText && !/^[A-Z]{3}$/.test(currencyText)) problems.push(`Currency "${currencyText}" is not a 3-letter code; INR used`);
    const projectText = cellToText(get(row, "project"), 200);
    const project = findProject(projectText);

    let status: ExpenseLine["status"] = problems.some((p) => !p.includes("INR used")) ? "error" : "ok";
    if (status === "ok") {
      const key = claimKey(date, amount, description);
      if (seen.has(key)) {
        status = "duplicate";
        problems.push("Same date, amount and description is already claimed");
      } else seen.add(key);
    }
    if (projectText && !project) problems.push(`Project "${projectText}" is not in the project list; saved without a project`);

    lines.push({
      row: r + 1, expense_date: date, category, description, amount, currency,
      payment_method: toPayment(cellToText(get(row, "payment"), 60)),
      project_id: project?.id ?? null, project_text: projectText, origin, destination, status, problems,
    });
    if (lines.length > MAX_EXPENSE_ROWS) break;
  }
  return { header, columns, lines };
}

export const EXPENSE_TEMPLATE_HEADERS = ["Date", "Category", "Description", "Amount", "Currency", "Paid by", "Project", "From", "To"];
export const EXPENSE_TEMPLATE_ROWS = [
  ["2026-10-14", "Cab", "Airport to site office", "650", "INR", "UPI", "", "Hyderabad airport", "Site office"],
  ["2026-10-14", "Meals", "Dinner during site visit", "420", "INR", "Cash", "", "", ""],
];
