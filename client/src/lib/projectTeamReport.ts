import type { BiFilters, LedgerRow, ProjectDetail } from "./data/bi";
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
      "A booking counts for this project when the project column of the uploaded sheet names it. Different capitals, spaces or dashes in the name count as the same project.",
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

// ---------------------------------------------------------------------------
// Projects straight from the sheets: every booking is grouped by the project
// name written in the uploaded Excel (or the project it was put on), so no
// linking step is needed.
// ---------------------------------------------------------------------------

/** A booking as read from travel_records for the project pages. */
export type SheetTrip = {
  id: string; employee_id: string; departure_date: string; return_date: string | null;
  origin: string | null; destination: string | null; booking_type: string; airline_or_provider: string | null;
  booking_reference: string | null; status: string; project_raw: string | null; purpose: string | null;
  amount: number | string | null; currency: string; source_sheet: string | null;
  project?: { name: string } | null;
  profile?: { full_name: string | null; employee_id: string | null; department: string | null } | null;
};

export type SheetProject = {
  key: string; name: string; spellings: string[];
  bookings: number; travellers: number; spend: number; first_date: string | null; last_date: string | null;
  detail: ProjectDetail;
};

/** "Kakinada  Port", "KAKINADA-PORT" -> "kakinada port". Empty or N/A -> null. */
export function projectKey(name: string | null | undefined): string | null {
  const k = (name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!k || ["na", "n a", "nil", "nill", "none", "null", "no", "tbd", "tba", "0", "not applicable"].includes(k)) return null;
  return k;
}

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

export function groupSheetProjects(trips: SheetTrip[], currency = "INR"): SheetProject[] {
  const groups = new Map<string, SheetTrip[]>();
  for (const t of trips) {
    const label = t.project?.name || t.project_raw;
    const key = projectKey(label);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }
  const out: SheetProject[] = [];
  for (const [key, list] of Array.from(groups.entries())) {
    // The name shown is the spelling used most often.
    const counts = new Map<string, number>();
    for (const t of list) { const n = tidy(t.project?.name || t.project_raw || ""); counts.set(n, (counts.get(n) ?? 0) + 1); }
    const spellings = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => n);
    const detail = projectDetailFromTrips(list, currency);
    out.push({ key, name: spellings[0], spellings, bookings: detail.kpis.bookings, travellers: detail.kpis.travellers,
      spend: detail.kpis.spend, first_date: detail.kpis.first_date ?? null, last_date: detail.kpis.last_date ?? null, detail });
  }
  return out.sort((a, b) => b.spend - a.spend || b.bookings - a.bookings || a.name.localeCompare(b.name));
}

/** The same shape the project page uses, worked out from the bookings. */
export function projectDetailFromTrips(list: SheetTrip[], currency = "INR"): ProjectDetail {
  const num = (v: number | string | null) => (v == null || v === "" ? null : Number(v));
  const spendOf = (t: SheetTrip) => (t.status === "cancelled" || t.currency !== currency ? 0 : num(t.amount) ?? 0);
  const stateOf = (t: SheetTrip): LedgerRow["cost_state"] => { const a = num(t.amount); return a == null ? "missing" : a === 0 ? "zero" : "recorded"; };
  const people = new Map<string, ProjectDetail["employees"][number]>();
  const dates = list.map((t) => t.departure_date).filter(Boolean).sort();
  for (const t of list) {
    const p = people.get(t.employee_id) ?? { employee_id: t.employee_id, full_name: t.profile?.full_name ?? "Unknown", employee_code: t.profile?.employee_id ?? "",
      department: (t.profile?.department ?? "").trim() || "Not recorded", bookings: 0, spend: 0, without_cost: 0, first_date: t.departure_date, last_date: t.departure_date };
    p.bookings += 1;
    p.spend = Math.round((p.spend + spendOf(t)) * 100) / 100;
    if (num(t.amount) == null) p.without_cost += 1;
    if (t.departure_date < p.first_date) p.first_date = t.departure_date;
    if (t.departure_date > p.last_date) p.last_date = t.departure_date;
    people.set(t.employee_id, p);
  }
  const ledger: LedgerRow[] = [...list].sort((a, b) => b.departure_date.localeCompare(a.departure_date)).map((t) => ({
    id: t.id, employee_id: t.employee_id, full_name: t.profile?.full_name ?? "Unknown", employee_code: t.profile?.employee_id ?? "",
    departure_date: t.departure_date, return_date: t.return_date, origin: t.origin, destination: t.destination, route: null,
    category: t.booking_type, provider: t.airline_or_provider, booking_reference: t.booking_reference, status: t.status,
    project_raw: t.project_raw, purpose: t.purpose, amount: num(t.amount), currency: t.currency, cost_state: stateOf(t),
    source_sheet: t.source_sheet, cost_lines: 1,
  }));
  const costed = list.filter((t) => t.status !== "cancelled" && t.currency === currency && num(t.amount) != null);
  return {
    base_currency: currency, project: null, aliases: [], other_currencies: [], monthly: [], routes: [], destinations: [], providers: [], categories: [], purposes: [],
    kpis: {
      bookings: list.length, travellers: people.size,
      spend: Math.round(list.reduce((s, t) => s + spendOf(t), 0) * 100) / 100,
      costed_bookings: costed.length, missing_cost: list.filter((t) => num(t.amount) == null).length, shared_cost: 0,
      cancelled: list.filter((t) => t.status === "cancelled").length,
      cancelled_cost: list.filter((t) => t.status === "cancelled").reduce((s, t) => s + (num(t.amount) ?? 0), 0),
      first_date: dates[0] ?? null, last_date: dates[dates.length - 1] ?? null,
      places: new Set(list.map((t) => place(t.destination)).filter(Boolean)).size,
    } as ProjectDetail["kpis"],
    employees: Array.from(people.values()).sort((a, b) => b.spend - a.spend || b.bookings - a.bookings || a.full_name.localeCompare(b.full_name)),
    ledger, ledger_total: list.length,
  };
}
