import test from "node:test";
import assert from "node:assert";
import { checkImportFile, detectMapping, mapRows, missingRequired, normalizeDateCell } from "../lib/data/importParser.ts";

const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
const TEXT = new TextEncoder().encode("Employee");

test("file checks", async (t) => {
  await t.test("accepts real xlsx and csv", () => {
    assert.deepStrictEqual(checkImportFile("Oct.xlsx", 1000, ZIP), { ok: true, kind: "xlsx" });
    assert.deepStrictEqual(checkImportFile("oct.CSV", 1000, TEXT), { ok: true, kind: "csv" });
  });
  await t.test("rejects wrong types, renamed files, empty and oversized files", () => {
    assert.strictEqual(checkImportFile("virus.exe", 10, ZIP).ok, false);
    assert.strictEqual(checkImportFile("old.xls", 10, ZIP).ok, false);
    assert.strictEqual(checkImportFile("fake.xlsx", 10, TEXT).ok, false); // text renamed to .xlsx
    assert.strictEqual(checkImportFile("bin.csv", 10, new Uint8Array([1, 0, 2])).ok, false);
    assert.strictEqual(checkImportFile("e.csv", 0, TEXT).ok, false);
    assert.strictEqual(checkImportFile("big.csv", 6 * 1024 * 1024, TEXT).ok, false);
  });
});

test("column detection handles the usual spreadsheet headings", () => {
  const headers = ["Employee Name", "Employee ID", "Travel Date", "From", "To", "Airline", "PNR", "Ticket Number", "Amount", "Purpose", "Flight"];
  const m = detectMapping(headers);
  assert.strictEqual(m["Employee Name"], "employee_name");
  assert.strictEqual(m["Employee ID"], "employee_code");
  assert.strictEqual(m["Travel Date"], "departure_date");
  assert.strictEqual(m["From"], "origin");
  assert.strictEqual(m["To"], "destination");
  assert.strictEqual(m["Airline"], "provider");
  assert.strictEqual(m["PNR"], "booking_reference");
  assert.strictEqual(m["Ticket Number"], "ticket_number");
  assert.strictEqual(m["Amount"], "amount");
  assert.strictEqual(m["Purpose"], "");
  assert.deepStrictEqual(missingRequired(m), []);
  const alt = detectMapping(["Origin", "Destination", "Date", "Name"]);
  assert.strictEqual(alt["Origin"], "origin");
  assert.strictEqual(alt["Destination"], "destination");
  assert.deepStrictEqual(missingRequired(detectMapping(["Notes"])), ["Employee ID or employee name", "Travel date", "From", "To"]);
});

test("dates from Excel and text become YYYY-MM-DD", () => {
  assert.strictEqual(normalizeDateCell(new Date(Date.UTC(2026, 9, 14))), "2026-10-14");
  assert.strictEqual(normalizeDateCell(46309), "2026-10-14"); // Excel serial
  assert.strictEqual(normalizeDateCell("14/10/2026"), "2026-10-14");
  assert.strictEqual(normalizeDateCell("14-Oct-2026"), "2026-10-14");
  assert.strictEqual(normalizeDateCell("14-Oct-26"), "2026-10-14");
  assert.strictEqual(normalizeDateCell("2026-10-14 09:30"), "2026-10-14");
  assert.strictEqual(normalizeDateCell("next tuesday"), "next tuesday"); // left for the server to flag
});

test("mapping rows sends strings for mapped columns only", () => {
  const headers = ["Name", "Date", "From", "To", "Fare", "Secret notes"];
  const m = { ...detectMapping(headers), "Secret notes": "" as const };
  const out = mapRows(headers, [["Arun Kumar", new Date(Date.UTC(2026, 9, 14)), "Chennai", "Delhi", 8450, "do not send"]], m);
  assert.deepStrictEqual(out, [{ employee_name: "Arun Kumar", departure_date: "2026-10-14", origin: "Chennai", destination: "Delhi", amount: "8450" }]);
});
