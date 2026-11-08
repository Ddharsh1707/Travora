import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { LedgerRow, ProjectDetail } from "../lib/data/bi.ts";
import { buildProjectTeamReport, describeTeamFilters } from "../lib/projectTeamReport.ts";
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
});
