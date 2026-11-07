import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { detectExpenseColumns, findHeaderRow, parseExpenseSheet, toAmount, toCategory } from "../lib/data/expenseUpload.ts";
import { summarizeSpend } from "../lib/data/spend.ts";
import { safeCell } from "../utils/exportXlsx.ts";

describe("Employee expense upload", () => {
  test("finds a header that is not on the first row", () => {
    const rows = [["MY EXPENSES SEP"], [], ["S.No", "Bill Date", "Particulars", "Expense Head", "Amount (Rs)", "Project"]];
    assert.equal(findHeaderRow(rows), 2, "\"Amount (Rs)\" counts as the amount column");
    assert.deepEqual(detectExpenseColumns(rows[2] as string[]), { 1: "date", 2: "description", 3: "category", 4: "amount", 5: "project" });
  });
  test("reads amounts and categories the way people write them", () => {
    assert.equal(toAmount("₹1,234.50"), 1234.5);
    assert.equal(toAmount("Rs. 650/-"), 650);
    assert.equal(toAmount("abc"), null);
    assert.equal(toAmount(99.999), 100);
    assert.equal(toCategory("Uber to site"), "cab");
    assert.equal(toCategory("Lunch"), "meals");
    assert.equal(toCategory("Cab / taxi"), "cab");
    assert.equal(toCategory("Stationery"), "other");
  });
  test("marks errors, duplicates, totals and unknown projects", () => {
    const rows = [
      ["Date", "Category", "Description", "Amount", "Project", "From", "To"],
      ["2026-09-02", "Cab", "Airport cab", "650", "HRRL", "HYD", "Site"],
      ["02/09/2026", "Cab", "Airport cab", "650", "", "", ""],          // same as row 2 → duplicate
      ["2026-09-03", "Meals", "", "300", "Unknown Site", "", ""],       // blank description → built from category
      ["", "Hotel", "Stay", "4000", "", "", ""],                         // no date → error
      ["2026-09-04", "Hotel", "Stay", "-5", "", "", ""],                 // negative → error
      ["2026-09-05", "Other", "Already claimed", "100", "", "", ""],     // in existing claims → duplicate
      ["TOTAL", "", "", "5705", "", "", ""],                             // total line → skipped
    ];
    const { lines, error } = parseExpenseSheet(rows, {
      projects: [{ id: "11111111-1111-1111-1111-111111111111", name: "HRRL Refinery", code: "HRRL" }],
      existing: [{ expense_date: "2026-09-05", amount: "100.00", description: "already claimed" }],
      today: "2026-11-07",
    });
    assert.equal(error, undefined);
    assert.equal(lines.length, 6);
    assert.deepEqual(lines.map((l) => l.status), ["ok", "duplicate", "ok", "error", "error", "duplicate"]);
    assert.equal(lines[0].project_id, "11111111-1111-1111-1111-111111111111");
    assert.equal(lines[0].origin, "HYD");
    assert.equal(lines[2].description, "Meals");
    assert.ok(lines[2].problems.some((p) => p.includes("Unknown Site")));
  });
  test("future dates are refused", () => {
    const { lines } = parseExpenseSheet([["Date", "Amount"], ["2027-01-01", "10"]], { today: "2026-11-07" });
    assert.equal(lines[0].status, "error");
  });
  test("no header gives a clear error", () => {
    assert.ok(parseExpenseSheet([["Name", "Notes"], ["x", "y"]]).error);
  });
});

describe("All spend totals", () => {
  test("withdrawn, rejected and cancelled amounts are kept apart", () => {
    const t = summarizeSpend([
      { source: "claim", counted: 100, amount: 100, employee_id: "a" },
      { source: "claim", counted: 0, amount: 50, employee_id: "a" },
      { source: "trip", counted: 1000, amount: 1000, employee_id: "b" },
      { source: "trip", counted: 0, amount: null, employee_id: "b" },
    ]);
    assert.deepEqual(t, { total: 1100, claims: 100, trips: 1000, notCounted: 50, missing: 1, people: 2, records: 4 });
  });
  test("Excel export neutralises formulas", () => {
    assert.equal(safeCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
    assert.equal(safeCell(-5), -5);
    assert.equal(safeCell(null), "");
  });
});
