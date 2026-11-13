import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { LedgerRow, ProjectDetail } from "../lib/data/bi.ts";
import { buildProjectTeamReport, describeTeamFilters, groupSheetProjects, projectDetailFromTrips, projectHref, projectKey, projectKeyFromSlug, type SheetTrip } from "../lib/projectTeamReport.ts";
import { reportToCsv } from "../lib/reportDoc.ts";

const trip = (o: Partial<LedgerRow>): LedgerRow => ({
  id: "t", employee_id: "e1", full_name: "Asha Rao", employee_code: "E1", departure_date: "2026-09-02", return_date: null,
  origin: "hyd", destination: "del", route: null, category: "flight", provider: "IndiGo", booking_reference: "PNR1", status: "completed",
  project_raw: "Site Alpha", purpose: "Audit", amount: 5000, currency: "INR", cost_state: "recorded", source_sheet: "AIR TICKETING", cost_lines: 1, ...o,
});

const data = {
  base_currency: "INR", project: null, aliases: [], other_currencies: [], monthly: [], routes: [], destinations: [], providers: [], categories: [], purposes: [],
  kpis: { bookings: 3, travellers: 2, spend: 9000, costed_bookings: 2, missing_cost: 1, shared_cost: 0, cancelled: 1, cancelled_cost: 0, first_date: "2026-09-02", last_date: "2026-09-20", places: 2 },
  employees: [
    { employee_id: "e1", full_name: "Asha Rao", employee_code: "E1", department: "Civil", bookings: 2, spend: 5000, without_cost: 0, first_date: "2026-09-02", last_date: "2026-09-10" },
    { employee_id: "e2", full_name: "=Ravi", employee_code: "E2", department: "Not recorded", bookings: 1, spend: 4000, without_cost: 1, first_date: "2026-09-20", last_date: "2026-09-20" },
  ],
  ledger: [
    trip({ id: "a" }),
    trip({ id: "b", departure_date: "2026-09-10", category: "hotel", origin: null, destination: "Mumbai", status: "cancelled", amount: null }),
    trip({ id: "c", employee_id: "e2", full_name: "=Ravi", employee_code: "E2", departure_date: "2026-09-20", amount: 4000 }),
  ],
  ledger_total: 3,
} as unknown as ProjectDetail;

describe("Project team report", () => {
  test("one row per person with their places and types, plus every booking", () => {
    const doc = buildProjectTeamReport(data, { projectName: "Site Alpha", filters: [["Filters", "None"]], generatedAt: "2026-11-08T05:00:00Z" });
    assert.equal(doc.fileName, "site_alpha_team_report_2026-11-08");
    const [people, bookings] = doc.sections;
    assert.equal(people.rows.length, 2);
    assert.deepEqual(people.rows[0].slice(0, 9), ["E1", "Asha Rao", "Civil", 2, 5000, 0, 1, "Flight, Hotel", "DEL, MUMBAI"]);
    assert.deepEqual(people.total?.slice(3, 7), [3, 9000, 1, 1]);
    assert.equal(bookings.rows.length, 3);
    for (const s of doc.sections) for (const r of s.rows) assert.equal(r.length, s.columns.length, s.title);
    assert.equal(bookings.rows.find((r) => r[4] === "Hotel")?.[11], null, "a blank cost stays blank");
    assert.ok(reportToCsv(doc).includes("\"'=Ravi\""), "formula-looking names are escaped in CSV");
  });

  test("filters are written in words", () => {
    assert.deepEqual(describeTeamFilters({}, data), [["Filters", "None (all travel on this project)"]]);
    assert.deepEqual(describeTeamFilters({ employee: "e1", category: "multi_modal" }, data), [["Employee", "Asha Rao (E1)"], ["Travel type", "Multi-modal"]]);
  });

  test("projects come straight from the sheet's project column", () => {
    const t = (o: Partial<SheetTrip>): SheetTrip => ({
      id: Math.random().toString(), employee_id: "e1", departure_date: "2026-09-02", return_date: null, origin: "HYD", destination: "DEL",
      booking_type: "flight", airline_or_provider: "IndiGo", booking_reference: "P", status: "completed", project_raw: "Kakinada Port",
      purpose: null, amount: "1000", currency: "INR", source_sheet: "AIR", profile: { full_name: "Asha Rao", employee_id: "E1", department: "Civil" }, ...o,
    });
    const groups = groupSheetProjects([
      t({}), t({ project_raw: "KAKINADA  PORT", amount: 500 }), t({ project_raw: "kakinada-port", employee_id: "e2", profile: { full_name: "Ravi", employee_id: "E2", department: "" }, amount: null }),
      t({ project_raw: "Kakinada Port", status: "cancelled", amount: 900 }),
      t({ project_raw: "HRRL", amount: 3000, departure_date: "2026-10-01" }),
      t({ project_raw: "N/A" }), t({ project_raw: null }), t({ project_raw: "old name", project: { name: "HRRL" } }),
    ]);
    assert.deepEqual(groups.map((g) => g.name), ["HRRL", "Kakinada Port"]);
    const k = groups[1];
    assert.equal(k.bookings, 4);
    assert.equal(k.travellers, 2);
    assert.equal(k.spend, 1500, "cancelled and blank costs are not spend");
    assert.deepEqual(k.detail.employees.map((e) => [e.full_name, e.bookings, e.department]), [["Asha Rao", 3, "Civil"], ["Ravi", 1, "Not recorded"]]);
    assert.equal(groups[0].bookings, 2, "a booking put on a project counts under that project's name");
    assert.equal(projectKey(" n/a "), null);
    const doc = buildProjectTeamReport(k.detail, { projectName: k.name, filters: [] });
    assert.equal(doc.sections[0].rows.length, 2);
    assert.equal(doc.sections[1].rows.length, 4);
  });

  test("every spelling of a project links to the same project page", () => {
    assert.equal(projectHref("Kakinada Port"), "/travel/bi/projects/p/kakinada-port");
    assert.equal(projectHref("KAKINADA  PORT"), projectHref("kakinada-port"));
    assert.equal(projectHref("N/A"), null);
    assert.equal(projectHref(null), null);
    assert.equal(projectKeyFromSlug("kakinada-port"), "kakinada port");
    assert.equal(projectKeyFromSlug("Kakinada%20Port"), "kakinada port");
    assert.equal(projectKeyFromSlug("%E0%A4%A"), "e0 a4 a", "a broken link does not throw");
    assert.equal(projectKeyFromSlug("na"), null);
  });

  test("project page breakdowns: by month, route, place, provider, type and purpose", () => {
    const t = (o: Partial<SheetTrip>): SheetTrip => ({
      id: Math.random().toString(), employee_id: "e1", departure_date: "2026-09-02", return_date: null, origin: "hyd", destination: "del",
      booking_type: "flight", airline_or_provider: "IndiGo", booking_reference: "P", status: "completed", project_raw: "HRRL",
      purpose: "Audit", amount: 1000, currency: "INR", source_sheet: "AIR", profile: { full_name: "Asha Rao", employee_id: "E1", department: "Civil" }, ...o,
    });
    const d = projectDetailFromTrips([
      t({}), t({ employee_id: "e2", amount: 2000 }), t({ departure_date: "2026-10-05", booking_type: "hotel", origin: null, destination: "Mumbai", airline_or_provider: "Taj", purpose: null, amount: 4000 }),
      t({ departure_date: "2026-10-09", status: "cancelled", amount: 700 }),
    ]);
    assert.deepEqual(d.monthly.map((m) => [m.month, m.bookings, m.spend, m.travellers]), [["2026-09", 2, 3000, 2], ["2026-10", 2, 4000, 1]]);
    assert.deepEqual(d.routes, [{ origin: "HYD", destination: "DEL", bookings: 3, spend: 3000 }]);
    assert.deepEqual(d.destinations.map((x) => x.destination), ["MUMBAI", "DEL"]);
    assert.deepEqual(d.providers.map((x) => [x.provider, x.category]), [["Taj", "hotel"], ["IndiGo", "flight"]]);
    assert.deepEqual(d.categories.map((x) => [x.category, x.bookings, x.spend]), [["hotel", 1, 4000], ["flight", 3, 3000]]);
    assert.deepEqual(d.purposes.map((x) => x.purpose), ["Not recorded", "Audit"]);
    assert.equal(projectDetailFromTrips([]).kpis.bookings, 0);
  });
});
