import type { Cell, ColumnKind, ReportDoc, ReportSection } from "./reportDoc";
import { RECORD_COLUMN_LABELS, TOOL_LABELS, type RecordSet } from "./data/assistant";

/**
 * Turns one assistant answer and the records behind it into a report, so it
 * can be downloaded as Excel, CSV or PDF with the same renderers as Reports.
 * Pure: no browser APIs, so it is tested in Node.
 */

const MONEY = new Set(["amount", "estimated_cost", "spend", "counted_amount", "total", "travel", "claimed", "cancelled_value", "total_estimated_cost"]);
const INT = new Set(["records", "claims", "trips", "people", "rows", "imported_rows", "error_rows", "count"]);

/** Every column that has a plain value in any row, in first-seen order. */
export function allColumns(rows: Array<Record<string, unknown>>): string[] {
  const cols: string[] = [];
  for (const r of rows) for (const [k, v] of Object.entries(r)) if (!cols.includes(k) && v !== null && v !== undefined && typeof v !== "object") cols.push(k);
  return cols;
}

function kindOf(col: string, rows: Array<Record<string, unknown>>): ColumnKind {
  const numeric = rows.every((r) => r[col] === null || r[col] === undefined || typeof r[col] === "number" || (typeof r[col] === "string" && /^-?\d+(\.\d+)?$/.test(r[col] as string)));
  if (!numeric) return "text";
  if (MONEY.has(col)) return "money";
  if (INT.has(col)) return "int";
  return "text";
}

function cell(v: unknown, kind: ColumnKind): Cell {
  if (v === null || v === undefined) return null;
  if (kind !== "text") return Number(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

const pretty = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function sectionFor(set: RecordSet): ReportSection | null {
  const cols = allColumns(set.rows);
  if (!cols.length) return null;
  const kinds = cols.map((c) => kindOf(c, set.rows));
  const rows = set.rows.map((r) => cols.map((c, i) => cell(r[c], kinds[i])));
  const moneyCol = kinds.findIndex((k) => k === "money");
  const total: Cell[] | undefined = moneyCol >= 0 && rows.length > 1
    ? cols.map((_, i) => (i === 0 ? "Total" : kinds[i] === "money" ? Math.round(rows.reduce((s, r) => s + Number(r[i] ?? 0), 0) * 100) / 100 : null))
    : undefined;
  return {
    title: pretty(TOOL_LABELS[set.tool] ?? "Records"),
    note: `${set.rows.length} row${set.rows.length === 1 ? "" : "s"}`,
    columns: cols.map((c, i) => ({ label: RECORD_COLUMN_LABELS[c] ?? pretty(c), kind: kinds[i] })),
    rows,
    total,
  };
}

/** Plain text from the answer's Markdown, one paragraph or list item per line. */
export function answerLines(answer: string): string[] {
  return answer
    .split(/\r?\n/)
    .map((l) => l.replace(/^#{1,6}\s*/, "").replace(/^\s*[-*+]\s+/, "- ").replace(/\*\*|__|`/g, "").replace(/\|/g, " ").trim())
    .filter((l) => l && !/^[-\s:]+$/.test(l))
    .slice(0, 80);
}

export function answerReport(question: string, answer: string, records: RecordSet[], now = new Date()): ReportDoc {
  const sections = records.map(sectionFor).filter((s): s is ReportSection => !!s);
  const stamp = now.toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return {
    kind: "management",
    title: "Trapple AI answer",
    subtitle: question.length > 140 ? `${question.slice(0, 137)}...` : question,
    currency: "INR",
    generatedAt: now.toISOString(),
    scope: "Records you are allowed to see",
    filters: [["Question", question]],
    highlights: [],
    summary: answerLines(answer),
    sections,
    methodology: [
      "The assistant looked these records up in Trapple with your own access, so it only sees what you can see on the screens.",
      "Tables list every record the lookup returned (up to 1,000 per table), not only the ones mentioned in the answer.",
    ],
    completeness: sections.length ? sections.map((s) => `${s.title}: ${s.note}`) : ["No table of records came with this answer."],
    fileName: `trapple-ai-answer-${stamp}`,
    auditName: "management_summary",
  };
}
