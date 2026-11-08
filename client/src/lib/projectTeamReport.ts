import type { BiFilters, ProjectDetail } from "./data/bi";
import { formatDay, intText, moneyText, type Cell, type ReportDoc } from "./reportDoc";

/**
 * The per-project team report: everyone who travelled on one project, with
 * their totals and every booking behind them. Built only from the numbers the
 * project page already loads. Pure, so it is unit tested.
 */

const TYPE_LABEL = (t: string) => (t === "multi_modal" ? "Multi-modal" : t.charAt(0).toUpperCase() + t.slice(1));
const place = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

/** The page filters in words, so the file says what it covers. */
export function describeTeamFilters(f: BiFilters, data: ProjectDetail): [string, string][] {
  const out: [string, string][] = [];
  if (f.from || f.to) out.push(["Travel dates", `${f.from ? formatDay(f.from) : "start"} to ${f.to ? formatDay(f.to) : "latest"}`]);
  if (f.employee) {
    const e = data.employees.find((x) => x.employee_id === f.employee);
    out.push(["Employee", e ? `${e.full_name} (${e.employee_code})` : "One employee"]);
  }
  if (f.department) out.push(["Department", f.department]);
  if (f.destination) out.push(["Destination", f.destination]);
  if (f.category) out.push(["Travel type", TYPE_LABEL(f.category)]);
  if (out.length === 0) out.push(["Filters", "None (all travel on this project)"]);
  return out;
}

export function buildProjectTeamReport(data: ProjectDetail, ctx: { projectName: string; filters: [string, string][]; generatedAt?: string }): ReportDoc {
  const cur = data.base_currency;
  const generatedAt = ctx.generatedAt ?? new Date().toISOString();
  const byEmployee = new Map<string, ProjectDetail["ledger"]>();
  for (const r of data.ledger) {
    const list = byEmployee.get(r.employee_id) ?? [];
    list.push(r);
    byEmployee.set(r.employee_id, list);
  }

  const people: Cell[][] = data.employees.map((e) => {
    const trips = byEmployee.get(e.employee_id) ?? [];
    const places = Array.from(new Set(trips.map((t) => place(t.destination)).filter(Boolean))).sort();
    const types = Array.from(new Set(trips.map((t) => TYPE_LABEL(t.category)))).sort();
    const cancelled = trips.filter((t) => t.status === "cancelled").length;
    return [e.employee_code || "", e.full_name, e.department, Number(e.bookings), Number(e.spend), Number(e.without_cost), cancelled,
      types.join(", "), places.join(", "), formatDay(e.first_date), formatDay(e.last_date)];
  });

  const bookings: Cell[][] = [...data.ledger]
    .sort((a, b) => a.full_name.localeCompare(b.full_name) || a.departure_date.localeCompare(b.departure_date))
    .map((r) => [r.employee_code || "", r.full_name, formatDay(r.departure_date), formatDay(r.return_date), TYPE_LABEL(r.category),
      place(r.origin), place(r.destination), r.provider ?? "", r.booking_reference ?? "", r.status.replace(/_/g, " "),
      r.purpose ?? "", r.amount == null ? null : Number(r.amount), r.currency, r.source_sheet ?? ""]);

  const k = data.kpis;
  const range = k.first_date ? `${formatDay(k.first_date)} to ${formatDay(k.last_date)}` : "No travel dates";
  const partial = data.ledger_total > data.ledger.length;
  const slug = ctx.projectName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "project";

  return {
    kind: "project",
    title: `${ctx.projectName}: team report`,
    subtitle: range,
    currency: cur,
    generatedAt,
    scope: `Everyone who travelled on ${ctx.projectName}`,
    filters: ctx.filters,
    highlights: [
      { label: "People who worked on it", value: intText(k.travellers) },
      { label: "Bookings", value: intText(k.bookings) },
      { label: "Travel spend", value: moneyText(k.spend, cur) },
      { label: "Places", value: intText(k.places) },
    ],
    sections: [
      {
        title: "Employees",
        note: "One row per person who travelled on this project",
        columns: [
          { label: "Employee ID", kind: "text" }, { label: "Employee", kind: "text" }, { label: "Department", kind: "text" },
          { label: "Bookings", kind: "int" }, { label: `Spend (${cur})`, kind: "money" }, { label: "Without a cost", kind: "int" },
          { label: "Cancelled", kind: "int" }, { label: "Travel types", kind: "text" }, { label: "Places visited", kind: "text" },
          { label: "First travel", kind: "text" }, { label: "Last travel", kind: "text" },
        ],
        rows: people,
        total: people.length ? ["", "Total", "", sum(people, 3), sum(people, 4), sum(people, 5), sum(people, 6), "", "", "", ""] : undefined,
      },
      {
        title: "Bookings by employee",
        note: partial ? `The latest ${intText(data.ledger.length)} of ${intText(data.ledger_total)} bookings` : "Every booking on this project",
        columns: [
          { label: "Employee ID", kind: "text" }, { label: "Employee", kind: "text" }, { label: "Travel date", kind: "text" },
          { label: "Return date", kind: "text" }, { label: "Type", kind: "text" }, { label: "From", kind: "text" }, { label: "To", kind: "text" },
          { label: "Provider", kind: "text" }, { label: "PNR / reference", kind: "text" }, { label: "Status", kind: "text" },
          { label: "Purpose", kind: "text" }, { label: "Cost", kind: "money" }, { label: "Currency", kind: "text" }, { label: "Sheet", kind: "text" },
        ],
        rows: bookings,
      },
    ],
    methodology: [
      "A booking counts for this project when its project name in the uploaded sheet is linked to the project, or it was assigned by hand.",
      `Spend adds up ${cur} costs of bookings that were not cancelled. Bookings in other currencies are listed but not added in.`,
      "Bookings with a blank cost, or a cost shared with another line, are counted as bookings but add nothing to spend.",
    ],
    completeness: [
      `${intText(k.missing_cost)} bookings have a blank cost in the sheet and ${intText(k.shared_cost)} share a cost recorded on another line.`,
      `${intText(k.cancelled)} bookings were cancelled.`,
      `Travel dates covered: ${range}.`,
    ],
    fileName: `${slug}_team_report_${generatedAt.slice(0, 10)}`,
    auditName: "project_report",
  };
}

function sum(rows: Cell[][], i: number): number {
  return Math.round(rows.reduce((s, r) => s + Number(r[i] ?? 0), 0) * 100) / 100;
}
