import { test } from "node:test";
import assert from "node:assert/strict";
import { fileTables, placesVisited, summarizeEmployeeSpend, type DetailedTrip } from "../lib/data/employeeSpend.ts";

const base: Omit<DetailedTrip, "id" | "departure_date" | "amount" | "status" | "booking_type"> = {
  employee_id: "e", request_id: null, booking_reference: null, origin: "HYD", destination: "BOM", route: null, return_date: null,
  airline_or_provider: null, ticket_number: null, currency: "INR", source: "import", created_at: "", project_raw: "Site A", purpose: null,
  booking_date: null, requisition_date: null, payment_mode: null, consultant: null, approved_by_text: null, source_sheet: "AIR", source_row: 4,
  notes: [], extra: null, import_batch_id: "b1", project: null, cost_lines: [],
};
const trip = (p: Partial<DetailedTrip> & Pick<DetailedTrip, "id" | "departure_date" | "amount" | "status" | "booking_type">): DetailedTrip => ({ ...base, ...p });

test("spend leaves out cancelled bookings, and spend + cancelled = what the file says", () => {
  const s = summarizeEmployeeSpend([
    trip({ id: "1", departure_date: "2026-09-01", amount: 10500, status: "completed", booking_type: "flight",
      cost_lines: [{ line_type: "fare", amount: 10000, amount_state: "recorded", description: null, source_row: 4 }, { line_type: "addon", amount: 500, amount_state: "recorded", description: null, source_row: 5 }] }),
    trip({ id: "2", departure_date: "2026-09-10", amount: 34575, status: "cancelled", booking_type: "flight" }),
    trip({ id: "3", departure_date: "2026-10-02", amount: "4200.50", status: "confirmed", booking_type: "hotel", project_raw: null, project: { name: "HRRL" } }),
    trip({ id: "4", departure_date: "2026-10-03", amount: null, status: "confirmed", booking_type: "cab" }),
    trip({ id: "5", departure_date: "2026-10-05", amount: 0, status: "refunded", booking_type: "flight",
      cost_lines: [{ line_type: "fare", amount: 3000, amount_state: "recorded", description: null, source_row: 9 }, { line_type: "refund", amount: -3000, amount_state: "recorded", description: null, source_row: 10 }] }),
  ]);
  assert.equal(s.trips, 4);
  assert.equal(s.spend, 14700.5);
  assert.equal(s.cancelledTrips, 1);
  assert.equal(s.cancelledValue, 34575);
  assert.equal(s.inFile, 49275.5);
  assert.equal(s.withoutCost, 1);
  assert.equal(s.refunds, -3000);
  assert.equal(s.extras, 500);
  assert.deepEqual(s.byMode.map((m) => [m.key, m.trips, m.spend]), [["flight", 2, 10500], ["hotel", 1, 4200.5], ["cab", 1, 0]]);
  assert.deepEqual(s.byMonth.map((m) => [m.key, m.spend]), [["2026-09", 10500], ["2026-10", 4200.5]]);
  assert.equal(s.byProject[0].key, "Site A");
  assert.ok(s.byProject.some((p) => p.key === "HRRL"));
  assert.equal(s.firstTrip, "2026-09-01");
  assert.equal(s.lastTrip, "2026-10-05");
});

test("file tables keep every original column in file order", () => {
  const tables = fileTables([
    trip({ id: "1", departure_date: "2026-09-01", amount: 1, status: "completed", booking_type: "flight", extra: { "Passenger Name": "RAVI", Cost: "10,000", Remarks: "window" } }),
    trip({ id: "2", departure_date: "2026-09-02", amount: 1, status: "completed", booking_type: "flight", extra: { "Passenger Name": "RAVI", Cost: "500", "Extra col": "x" } }),
    trip({ id: "3", departure_date: "2026-09-03", amount: 1, status: "completed", booking_type: "flight", extra: null }),
  ], { b1: { id: "b1", filename: "sep.xlsx", sheets: { AIR: ["S. No", "Passenger Name", "Cost", "Remarks"] } } });
  assert.equal(tables.length, 1);
  assert.equal(tables[0].title, "sep.xlsx · AIR");
  assert.deepEqual(tables[0].headers, ["Passenger Name", "Cost", "Remarks", "Extra col"]);
  assert.equal(tables[0].rows.length, 2);
});

test("places visited counts every stop and leaves out cancelled trips", () => {
  const places = placesVisited([
    trip({ id: "1", departure_date: "2026-09-01", amount: 10000, status: "completed", booking_type: "flight", origin: "BOM", destination: "VTZ", route: "BOM-VTZ" }),
    trip({ id: "2", departure_date: "2026-09-03", amount: 114738, status: "completed", booking_type: "flight", origin: "ROB", destination: "BOM", route: "ROB-NBO-BOM" }),
    trip({ id: "3", departure_date: "2026-09-05", amount: 14000, status: "completed", booking_type: "hotel", origin: null, destination: "Tiruchirappalli", route: null }),
    trip({ id: "4", departure_date: "2026-09-09", amount: 9000, status: "completed", booking_type: "flight", origin: "HYD", destination: "VTZ", route: "HYD-VTZ" }),
    trip({ id: "5", departure_date: "2026-09-10", amount: 5000, status: "cancelled", booking_type: "flight", origin: "HYD", destination: "DEL", route: "HYD-DEL" }),
  ]);
  const by = Object.fromEntries(places.map((p) => [p.place, p]));
  assert.deepEqual(Object.keys(by).sort(), ["BOM", "NBO", "TIRUCHIRAPPALLI", "VTZ"]);
  assert.equal(by.VTZ.visits, 2);
  assert.equal(by.VTZ.first, "2026-09-01");
  assert.equal(by.VTZ.last, "2026-09-09");
  assert.equal(by.VTZ.spend, 19000);
  assert.equal(by.NBO.spend, 0);
  assert.equal(by.BOM.spend, 114738);
  assert.equal(places[0].place, "VTZ");
});
