import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { buildRecordFilterOps, parseDateQuery, sanitizeTerm, summarizeRecords } from "../lib/data/travelQuery.ts";
import { friendlyError } from "../lib/data/travel.ts";

test("date phrases typed into search", async (t) => {
  await t.test("understands common formats", () => {
    assert.strictEqual(parseDateQuery("14 October 2026"), "2026-10-14");
    assert.strictEqual(parseDateQuery("Show travel on 14 October 2026"), "2026-10-14");
    assert.strictEqual(parseDateQuery("Oct 14, 2026"), "2026-10-14");
    assert.strictEqual(parseDateQuery("14th Oct 2026"), "2026-10-14");
    assert.strictEqual(parseDateQuery("14/10/2026"), "2026-10-14"); // day first
    assert.strictEqual(parseDateQuery("2026-10-14"), "2026-10-14");
  });
  await t.test("rejects non-dates and impossible dates", () => {
    assert.strictEqual(parseDateQuery("Arun Kumar"), null);
    assert.strictEqual(parseDateQuery("31 February 2026"), null);
    assert.strictEqual(parseDateQuery("EMP1024"), null);
  });
});

test("search input cannot alter the query", async (t) => {
  await t.test("strips filter syntax and wildcards", () => {
    assert.strictEqual(sanitizeTerm("arun),employee_id.neq.(x"), "arun employee id neq x");
    assert.strictEqual(sanitizeTerm("100%_*"), "100");
    assert.strictEqual(sanitizeTerm("  O'Brien  "), "O'Brien");
    assert.strictEqual(sanitizeTerm("அருண்"), "அருண்"); // non-Latin names survive
    assert.strictEqual(sanitizeTerm("x".repeat(500)).length, 80);
  });
  await t.test("free text becomes one OR filter over safe columns", () => {
    const ops = buildRecordFilterOps({ q: "Arun Kumar" });
    assert.strictEqual(ops.length, 1);
    assert.strictEqual(ops[0].op, "or");
    assert.ok(ops[0].value.includes("employee_name.ilike.*Arun Kumar*"));
    assert.ok(!/[()]/.test(ops[0].value));
  });
  await t.test("a typed date becomes an exact date filter", () => {
    assert.deepStrictEqual(buildRecordFilterOps({ q: "14 October 2026" }), [{ op: "eq", column: "departure_date", value: "2026-10-14" }]);
  });
  await t.test("invalid ids, dates and enum values are dropped", () => {
    const ops = buildRecordFilterOps({ employeeId: "1 or 1=1", from: "2026-13-40", status: "deleted" as never, bookingType: "rocket" as never });
    assert.deepStrictEqual(ops, []);
  });
  await t.test("range and filters combine", () => {
    const ops = buildRecordFilterOps({ from: "2026-10-01", to: "2026-10-31", destination: "Delhi", status: "confirmed" });
    assert.deepStrictEqual(ops, [
      { op: "gte", column: "departure_date", value: "2026-10-01" },
      { op: "lte", column: "departure_date", value: "2026-10-31" },
      { op: "ilike", column: "destination", value: "%Delhi%" },
      { op: "eq", column: "status", value: "confirmed" },
    ]);
  });
});

test("history summary", () => {
  const s = summarizeRecords(
    [
      { amount: 8450, status: "confirmed", departure_date: "2026-10-14" },
      { amount: "5000", status: "completed", departure_date: "2026-09-01" },
      { amount: 9999, status: "cancelled", departure_date: "2026-10-20" },
      { amount: 3000, status: "confirmed", departure_date: "2026-12-01" },
    ],
    new Date("2026-10-30T00:00:00Z"),
  );
  assert.deepStrictEqual(s, { totalTrips: 3, totalSpend: 16450, lastTrip: "2026-10-14", nextTrip: "2026-12-01", upcomingTrips: 1 });
});

test("errors shown to users never leak internals", () => {
  assert.strictEqual(friendlyError({ code: "42501", message: "new row violates row-level security policy for table travel_records" }).message, "You don't have permission to do that.");
  assert.strictEqual(friendlyError({ code: "23514", message: 'violates check constraint "travel_records_dates"' }).message, "Some details are not valid. Please check the form.");
  assert.strictEqual(friendlyError({ code: "XX000", message: "internal stack" }).message, "Something went wrong. Please try again.");
});

test("no real employee directory is shipped in the frontend bundle", () => {
  const api = fs.readFileSync(path.resolve(process.cwd(), "client/src/lib/api.ts"), "utf-8");
  assert.ok(/REGISTERED_EMPLOYEES: EmployeeAccount\[\] = \[\];/.test(api));
  assert.ok(!/workEmail: "/.test(api));
});
