import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fillMonths, presetRange, rangeError } from "../lib/data/reports.ts";

describe("Report date ranges", () => {
  test("financial year runs April to March", () => {
    assert.deepEqual(presetRange("this_fy", new Date(2026, 10, 6)), { from: "2026-04-01", to: "2027-03-31" });
    assert.deepEqual(presetRange("this_fy", new Date(2027, 1, 10)), { from: "2026-04-01", to: "2027-03-31" });
    assert.deepEqual(presetRange("last_fy", new Date(2026, 10, 6)), { from: "2025-04-01", to: "2026-03-31" });
  });
  test("last 12 months and this month", () => {
    assert.deepEqual(presetRange("last_12_months", new Date(2026, 10, 6)), { from: "2025-12-01", to: "2026-11-30" });
    assert.deepEqual(presetRange("this_month", new Date(2026, 1, 6)), { from: "2026-02-01", to: "2026-02-28" });
  });
  test("bad ranges are caught before asking the database", () => {
    assert.equal(rangeError({ from: "2026-01-01", to: "2026-12-31" }), null);
    assert.ok(rangeError({ from: "2026-12-31", to: "2026-01-01" }));
    assert.ok(rangeError({ from: "2010-01-01", to: "2026-01-01" }));
    assert.ok(rangeError({ from: "", to: "2026-01-01" }));
    assert.ok(rangeError({ from: "2026-01-01'; drop", to: "2026-01-02" }));
  });
  test("months without trips are filled with zeros", () => {
    const rows = fillMonths({ from: "2026-04-01", to: "2026-07-31" }, [{ month: "2026-05", trips: 3, spend: 900, travellers: 2 }]);
    assert.deepEqual(rows.map((r) => r.month), ["2026-04", "2026-05", "2026-06", "2026-07"]);
    assert.equal(rows[1].trips, 3);
    assert.equal(rows[2].spend, 0);
  });
  test("year boundary", () => {
    assert.deepEqual(fillMonths({ from: "2026-11-15", to: "2027-02-01" }, []).map((r) => r.month), ["2026-11", "2026-12", "2027-01", "2027-02"]);
  });
});

describe("Chart range", () => {
  test("stops at this month unless later trips exist", async () => {
    const { chartRange } = await import("../lib/data/reports.ts");
    const fy = { from: "2026-04-01", to: "2027-03-31" };
    assert.deepEqual(chartRange(fy, [{ month: "2026-06", trips: 1, spend: 1, travellers: 1 }], new Date(2026, 10, 6)), { from: "2026-04-01", to: "2026-11-01" });
    assert.deepEqual(chartRange(fy, [{ month: "2027-01", trips: 1, spend: 1, travellers: 1 }], new Date(2026, 10, 6)), { from: "2026-04-01", to: "2027-01-01" });
    assert.deepEqual(chartRange({ from: "2025-04-01", to: "2026-03-31" }, [], new Date(2026, 10, 6)), { from: "2025-04-01", to: "2026-03-31" });
  });
});
