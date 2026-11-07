import type { BiReport, ReportDimension, ReportGrain } from "./data/bi";
import { sanitizeCsvCell } from "../utils/exportCsv";

/**
 * Builds the downloadable reports from the numbers the database worked out.
 * Nothing here adds new numbers except sums of rows the database returned
 * and simple shares; every report carries the method and the gaps in the data.
 * Pure: no browser or network, so it is unit tested.
 */

export type ReportKind = "management" | "period" | "project" | "employee" | "travel" | "financial" | "completeness";
export type ColumnKind = "text" | "int" | "money" | "percent";
export type Cell = string | number | null;
export type ReportSection = { title: string; note?: string; columns: { label: string; kind: ColumnKind }[]; rows: Cell[][]; total?: Cell[] };
export type ReportDoc = {
  kind: ReportKind;
  title: string;
  subtitle: string;
  currency: string;
  generatedAt: string;
  scope: string;
  filters: [string, string][];
  highlights: { label: string; value: string }[];
  sections: ReportSection[];
  methodology: string[];
  completeness: string[];
  fileName: string;
  auditName: "management_summary" | "period_report" | "project_report" | "employee_report" | "travel_report_bi" | "financial_report" | "data_completeness";
};

export const REPORT_KINDS: { id: ReportKind; title: string; description: string; audit: ReportDoc["auditName"] }[] = [
  { id: "management", title: "Management summary", description: "Headline numbers, spend by period, top projects, departments, travellers and routes.", audit: "management_summary" },
  { id: "period", title: "Period report", description: "Each week, month, quarter or financial year with its projects, departments, travel types and busiest routes.", audit: "period_report" },
  { id: "project", title: "Project report", description: "Travel and spend for every project, and for each period.", audit: "project_report" },
  { id: "employee", title: "Employee report", description: "Travel and spend per person and department, and for each period.", audit: "employee_report" },
  { id: "travel", title: "Travel & destinations", description: "Most travelled routes overall and in each period, and travel types.", audit: "travel_report_bi" },
  { id: "financial", title: "Financial report", description: "Spend, cancelled cost and bookings without a cost, by period, travel type and department.", audit: "financial_report" },
  { id: "completeness", title: "Data completeness", description: "How many bookings in each sheet have a cost, a project and a status.", audit: "data_completeness" },
];

export const GRAIN_LABEL: Record<ReportGrain, string> = { week: "Weekly", month: "Monthly", quarter: "Quarterly", fy: "Financial year" };
const DIMENSION_LABEL: Record<ReportDimension, string> = { project: "Project", department: "Department", category: "Travel type", employee: "Employee" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-09" -> "Sep 2026", "2026-09-07" (a week) -> "Week of 7 Sep 2026", "FY 2026-27 Q2" stays. */
export function reportPeriodLabel(p: string, grain: ReportGrain): string {
  if (grain === "week" && /^\d{4}-\d{2}-\d{2}$/.test(p)) return `Week of ${Number(p.slice(8, 10))} ${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
  if (/^\d{4}-\d{2}$/.test(p)) return `${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
  return p;
}

export function formatDay(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

const indian = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
/** "INR 47,40,713". Written with the code, not the symbol, so every PDF font can show it. */
export function moneyText(n: number | null | undefined, currency: string): string {
  if (n == null || Number.isNaN(Number(n))) return "-";
  return `${currency} ${indian.format(Math.round(Number(n)))}`;
}
export const intText = (n: number | null | undefined) => (n == null ? "-" : indian.format(Number(n)));
export function share(part: number | null | undefined, whole: number | null | undefined): number | null {
  const w = Number(whole ?? 0);
  return w > 0 ? Math.round((Number(part ?? 0) / w) * 1000) / 10 : null;
}
const typeLabel = (t: string) => (t === "multi_modal" ? "Multi-modal" : t.charAt(0).toUpperCase() + t.slice(1));
const num = (v: number | string | null | undefined): number | null => (v == null || v === "" ? null : Number(v));

/** Text of one cell as a person reads it (PDF and on-screen preview). */
export function cellText(v: Cell, kind: ColumnKind, currency: string): string {
  if (v == null) return "-";
  if (kind === "money") return moneyText(Number(v), currency);
  if (kind === "int") return intText(Number(v));
  if (kind === "percent") return `${v}%`;
  return String(v);
}

export type ReportContext = { filters: [string, string][]; scope: string; generatedAt?: string };

export function buildReport(kind: ReportKind, data: BiReport, ctx: ReportContext): ReportDoc {
  const cur = data.base_currency;
  const t = data.totals;
  const g = data.grain;
  const meta = REPORT_KINDS.find((k) => k.id === kind)!;
  const pl = (p: string) => reportPeriodLabel(p, g);
  const spendTotal = Number(t.spend ?? 0);

  const dims = (d: ReportDimension) => data.dimensions.filter((x) => x.dimension === d);
  const byPeriod = (d: ReportDimension) => data.breakdown.filter((x) => x.dimension === d);
  const label = (d: ReportDimension, l: string) => (d === "category" ? typeLabel(l) : l);

  const dimensionSection = (d: ReportDimension, title: string, limit?: number, note?: string): ReportSection => {
    const all = dims(d);
    const person = d === "employee";
    const rows = (limit ? all.slice(0, limit) : all).map((x) => [label(d, x.label), x.bookings, ...(person ? [] : [x.travellers]), num(x.spend), share(x.spend, spendTotal), x.without_cost, x.cancelled]);
    const o = person ? 0 : 1;
    const rest = limit && all.length > limit ? all.length - limit : 0;
    return {
      title,
      note: [note, rest ? `Top ${limit} of ${all.length}; the Excel and CSV files list them all in the ${DIMENSION_LABEL[d].toLowerCase()} report.` : ""].filter(Boolean).join(" ") || undefined,
      columns: [{ label: DIMENSION_LABEL[d], kind: "text" }, { label: "Bookings", kind: "int" }, ...(person ? [] : [{ label: "Travellers", kind: "int" as const }]), { label: `Spend (${cur})`, kind: "money" }, { label: "Share of spend", kind: "percent" }, { label: "Without a cost", kind: "int" }, { label: "Cancelled", kind: "int" }],
      rows,
      total: rest ? undefined : ["Total", sum(rows, 1), ...(person ? [] : [null]), sum(rows, 2 + o), rows.length ? 100 : null, sum(rows, 4 + o), sum(rows, 5 + o)],
    };
  };
  const byPeriodSection = (d: ReportDimension, title: string): ReportSection => ({
    title,
    note: "Travellers are counted once in each period, so a person who travelled in two periods appears in both.",
    columns: [{ label: "Period", kind: "text" }, { label: DIMENSION_LABEL[d], kind: "text" }, { label: "Bookings", kind: "int" }, { label: "Travellers", kind: "int" }, { label: `Spend (${cur})`, kind: "money" }, { label: "Without a cost", kind: "int" }],
    rows: byPeriod(d).map((x) => [pl(x.period), label(d, x.label), x.bookings, x.travellers, num(x.spend), x.without_cost]),
  });
  const periodsSection = (title = `Spend by period (${GRAIN_LABEL[g].toLowerCase()})`): ReportSection => {
    const rows = data.periods.map((p) => [pl(p.period), `${formatDay(p.first_date)} to ${formatDay(p.last_date)}`, p.bookings, p.travellers, p.costed, p.without_cost, p.cancelled, num(p.spend), num(p.cancelled_cost)]);
    return {
      title,
      note: "Dates are the first and last travel date seen in the period. Travellers are counted once per period.",
      columns: [{ label: "Period", kind: "text" }, { label: "Travel dates", kind: "text" }, { label: "Bookings", kind: "int" }, { label: "Travellers", kind: "int" }, { label: "With a cost", kind: "int" }, { label: "Without a cost", kind: "int" }, { label: "Cancelled", kind: "int" }, { label: `Spend (${cur})`, kind: "money" }, { label: `Cancelled cost (${cur})`, kind: "money" }],
      rows,
      total: ["Total", "", sum(rows, 2), t.travellers, sum(rows, 4), sum(rows, 5), sum(rows, 6), sum(rows, 7), sum(rows, 8)],
    };
  };
  const routesSection = (limit = 25): ReportSection => ({
    title: "Most travelled routes",
    note: `From and to as written in the sheets. Average cost uses bookings with a cost only. Top ${limit} by bookings.`,
    columns: [{ label: "From", kind: "text" }, { label: "To", kind: "text" }, { label: "Bookings", kind: "int" }, { label: "Travellers", kind: "int" }, { label: `Spend (${cur})`, kind: "money" }, { label: `Average cost (${cur})`, kind: "money" }],
    rows: data.routes.slice(0, limit).map((r) => [r.origin, r.destination, r.bookings, r.travellers, num(r.spend), num(r.avg_cost)]),
  });
  const periodRoutesSection = (): ReportSection => ({
    title: "Busiest routes in each period",
    note: "Up to five routes per period, by bookings.",
    columns: [{ label: "Period", kind: "text" }, { label: "Rank", kind: "int" }, { label: "From", kind: "text" }, { label: "To", kind: "text" }, { label: "Bookings", kind: "int" }, { label: `Spend (${cur})`, kind: "money" }],
    rows: data.period_routes.map((r) => [pl(r.period), r.rank, r.origin, r.destination, r.bookings, num(r.spend)]),
  });
  const completenessSection = (): ReportSection => {
    const rows = data.completeness.map((c) => [c.source, typeLabel(c.category), c.bookings, c.with_cost, share(c.with_cost, c.bookings), c.shared, c.missing, c.cancelled, c.unassigned]);
    return {
      title: "Cost and project completeness by sheet",
      note: "\"Shared\" means the cost sits on another line (for example one hotel bill for two people). \"Blank\" means the sheet has no cost.",
      columns: [{ label: "Sheet", kind: "text" }, { label: "Travel type", kind: "text" }, { label: "Bookings", kind: "int" }, { label: "With a cost", kind: "int" }, { label: "With a cost %", kind: "percent" }, { label: "Shared cost", kind: "int" }, { label: "Blank cost", kind: "int" }, { label: "Cancelled", kind: "int" }, { label: "No project", kind: "int" }],
      rows,
      total: ["All sheets", "", sum(rows, 2), sum(rows, 3), share(sum(rows, 3), sum(rows, 2)), sum(rows, 5), sum(rows, 6), sum(rows, 7), sum(rows, 8)],
    };
  };
  const otherCurrencySection = (): ReportSection[] => data.other_currencies.length === 0 ? [] : [{
    title: "Other currencies",
    note: `Kept apart and never added to the ${cur} totals, because the sheets carry no exchange rate.`,
    columns: [{ label: "Currency", kind: "text" }, { label: "Bookings", kind: "int" }, { label: "Amount", kind: "text" }],
    rows: data.other_currencies.map((o) => [o.currency, o.bookings, moneyText(o.spend, o.currency)]),
  }];

  let sections: ReportSection[];
  switch (kind) {
    case "management":
      sections = [periodsSection(), dimensionSection("project", "Top projects", 10), dimensionSection("department", "Departments"), dimensionSection("category", "Travel types"), dimensionSection("employee", "Top travellers", 10), routesSection(10), ...otherCurrencySection()];
      break;
    case "period":
      sections = [periodsSection("Periods"), byPeriodSection("project", "Projects in each period"), byPeriodSection("department", "Departments in each period"), byPeriodSection("category", "Travel types in each period"), periodRoutesSection()];
      break;
    case "project":
      sections = [dimensionSection("project", "Projects", undefined, "Only the project written on each booking or assigned by the CEO. Bookings with no project are shown as \"Not linked to a project\"."), byPeriodSection("project", "Projects in each period")];
      break;
    case "employee":
      sections = [dimensionSection("employee", "Travellers"), dimensionSection("department", "Departments"), byPeriodSection("employee", "Travellers in each period")];
      break;
    case "travel":
      sections = [routesSection(), periodRoutesSection(), dimensionSection("category", "Travel types")];
      break;
    case "financial":
      sections = [periodsSection(), byPeriodSection("category", "Travel types in each period"), dimensionSection("department", "Departments"), dimensionSection("project", "Projects"), ...otherCurrencySection()];
      break;
    case "completeness":
      sections = [completenessSection(), ...otherCurrencySection()];
      break;
  }

  const range = t.first_date ? `${formatDay(t.first_date)} to ${formatDay(t.last_date)}` : "No travel dates";
  const highlights = [
    { label: "Travel spend", value: moneyText(spendTotal, cur) },
    { label: "Bookings", value: intText(t.bookings) },
    { label: "Travellers", value: intText(t.travellers) },
    { label: "Bookings without a cost", value: intText(t.missing_cost + t.shared_cost) },
    { label: "Cancelled", value: `${intText(t.cancelled)} (${moneyText(t.cancelled_cost, cur)})` },
    { label: "Not linked to a project", value: intText(t.unassigned) },
  ];

  const methodology = [
    `Spend is the cost of bookings that were not cancelled, in ${cur}. Cancelled bookings are counted, and their cost is shown on its own; refunds are not in the sheets.`,
    "Bookings with a blank cost, or whose cost is recorded on another line, are counted as bookings but add nothing to spend. They are never treated as a cost of zero.",
    `Periods follow the travel date${g === "week" ? "; weeks start on Monday" : ""}. The financial year runs 1 April to 31 March, and Q1 is April to June.`,
    "Projects come only from the project written on each booking, or one the CEO assigned. No project is guessed.",
    "Each traveller is counted once per row: once in a period, once in a project, and once in the whole report.",
    data.other_currencies.length
      ? `Amounts in ${data.other_currencies.map((o) => o.currency).join(", ")} are listed apart and never added to the ${cur} totals, because the sheets carry no exchange rate.`
      : `Every amount in this report is in ${cur}.`,
    "Totals in this report are sums of the rows shown, worked out by the database with the same rules as the Business Intelligence pages.",
  ];
  const completeness = [
    `${intText(t.costed)} of ${intText(t.bookings)} bookings have a cost of their own (${share(t.costed, t.bookings) ?? 0}%).`,
    `${bookingsText(t.missing_cost)} ${t.missing_cost === 1 ? "has" : "have"} a blank cost in the sheet, and ${intText(t.shared_cost)} ${t.shared_cost === 1 ? "shares" : "share"} a cost recorded on another line.`,
    t.zero_cost ? `${bookingsText(t.zero_cost)} ${t.zero_cost === 1 ? "shows" : "show"} a cost of zero in the sheet.` : "",
    `${bookingsText(t.cancelled)} ${t.cancelled === 1 ? "was" : "were"} cancelled, with ${moneyText(t.cancelled_cost, cur)} of cost.`,
    `${bookingsText(t.unassigned)} ${t.unassigned === 1 ? "is" : "are"} not linked to a project.`,
    `Travel dates covered: ${range}.`,
  ].filter(Boolean);

  const generatedAt = ctx.generatedAt ?? data.generated_at;
  return {
    kind,
    title: meta.title,
    subtitle: `${kind === "completeness" || kind === "travel" ? "" : `${GRAIN_LABEL[g]} · `}${range}`,
    currency: cur,
    generatedAt,
    scope: ctx.scope,
    filters: ctx.filters,
    highlights,
    sections,
    methodology,
    completeness,
    fileName: `${meta.title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}${kind === "completeness" || kind === "travel" ? "" : `_${g}`}_${generatedAt.slice(0, 10)}`,
    auditName: meta.audit,
  };
}

const bookingsText = (n: number) => `${intText(n)} ${n === 1 ? "booking" : "bookings"}`;

/** "7 Nov 2026, 9:15 am" in India time, so the date can't be read as 11 July. */
export function generatedText(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const ist = new Date(d.getTime() + 330 * 60000);
  const h = ist.getUTCHours();
  return `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}, ${h % 12 || 12}:${String(ist.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "am" : "pm"} IST`;
}

function sum(rows: Cell[][], i: number): number {
  return Math.round(rows.reduce((s, r) => s + Number(r[i] ?? 0), 0) * 100) / 100;
}

/** One CSV file: report details first, then each table under its title. */
export function reportToCsv(doc: ReportDoc): string {
  const line = (cells: Cell[]) => cells.map(sanitizeCsvCell).join(",");
  const out: string[] = [
    line([doc.title]), line([doc.subtitle]),
    line(["Generated", generatedText(doc.generatedAt)]), line(["Covers", doc.scope]),
    ...doc.filters.map(([k, v]) => line([k, v])),
    "",
  ];
  for (const s of doc.sections) {
    out.push(line([s.title]));
    if (s.note) out.push(line([s.note]));
    out.push(line(s.columns.map((c) => c.label)));
    for (const r of s.rows) out.push(line(r));
    if (s.total) out.push(line(s.total));
    out.push("");
  }
  out.push(line(["How this was calculated"]), ...doc.methodology.map((m) => line([m])), "");
  out.push(line(["Data completeness"]), ...doc.completeness.map((m) => line([m])));
  return out.join("\r\n");
}

/** Excel sheet names: at most 31 characters, no []:*?/\ and no repeats. */
export function sheetName(title: string, used: Set<string>): string {
  const base = title.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Sheet";
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
  used.add(name.toLowerCase());
  return name;
}

/** Text the built-in PDF fonts can draw: arrows and dashes become plain characters, anything else outside Latin-1 is dropped. */
export function pdfSafe(s: string): string {
  return s.replace(/[→⇒]/g, "to").replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, "\"").replace(/₹/g, "INR ").replace(/…/g, "...").replace(/·/g, "-")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x00-\xFF]/g, "");
}
