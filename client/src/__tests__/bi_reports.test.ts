import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { BiReport } from "../lib/data/bi.ts";
import { REPORT_KINDS, buildReport, cellText, generatedText, moneyText, pdfSafe, reportPeriodLabel, reportToCsv, sheetName } from "../lib/reportDoc.ts";

const data: BiReport = {
  base_currency: "INR", grain: "week", viewer_role: "admin", generated_at: "2026-11-07T10:00:00Z",
  totals: { bookings: 5, travellers: 3, spend: 4740713.1, costed: 3, missing_cost: 1, shared_cost: 1, zero_cost: 0, cancelled: 1, cancelled_cost: 34575, unassigned: 2, first_date: "2026-09-02", last_date: "2026-10-04" },
  other_currencies: [{ currency: "USD", bookings: 1, spend: 120 }],
  periods: [
    { period: "2026-08-31", first_date: "2026-09-02", last_date: "2026-09-02", bookings: 2, travellers: 2, spend: 4000000, cancelled_cost: 0, costed: 1, without_cost: 1, cancelled: 0 },
    { period: "2026-09-28", first_date: "2026-10-04", last_date: "2026-10-04", bookings: 3, travellers: 2, spend: 740713.1, cancelled_cost: 34575, costed: 2, without_cost: 1, cancelled: 1 },
  ],
  breakdown: [
    { dimension: "project", period: "2026-08-31", key: "p1", label: "Site Alpha", bookings: 2, travellers: 2, spend: 4000000, without_cost: 1 },
    { dimension: "project", period: "2026-09-28", key: "unassigned", label: "Not linked to a project", bookings: 3, travellers: 2, spend: 740713.1, without_cost: 1 },
  ],
  dimensions: [
    { dimension: "project", key: "p1", label: "Site Alpha", bookings: 2, travellers: 2, spend: 4000000, without_cost: 1, cancelled: 0 },
    { dimension: "project", key: "unassigned", label: "Not linked to a project", bookings: 3, travellers: 2, spend: 740713.1, without_cost: 1, cancelled: 1 },
    { dimension: "category", key: "flight", label: "flight", bookings: 4, travellers: 3, spend: 4740713.1, without_cost: 1, cancelled: 1 },
    { dimension: "category", key: "multi_modal", label: "multi_modal", bookings: 1, travellers: 1, spend: 0, without_cost: 1, cancelled: 0 },
    { dimension: "employee", key: "e1", label: "=HYPERLINK(\"x\") (E1)", bookings: 3, travellers: 1, spend: 4000000, without_cost: 0, cancelled: 0 },
    { dimension: "employee", key: "e2", label: "Ravi Demo (E2)", bookings: 2, travellers: 1, spend: 740713.1, without_cost: 2, cancelled: 1 },
  ],
  routes: [{ origin: "HYD", destination: "DEL", bookings: 2, travellers: 1, spend: 1000, avg_cost: 1000 }],
  period_routes: [{ period: "2026-08-31", origin: "HYD", destination: "DEL", bookings: 2, spend: 1000, rank: 1 }],
  completeness: [{ source: "AIR", category: "flight", bookings: 4, with_cost: 3, shared: 0, missing: 1, cancelled: 1, unassigned: 2 }],
};
const ctx = { filters: [["Filters", "None, all travel"]] as [string, string][], scope: "the whole company" };

describe("Downloadable reports", () => {
  test("every report kind builds, with method and completeness notes", () => {
    for (const k of REPORT_KINDS) {
      const doc = buildReport(k.id, data, ctx);
      assert.ok(doc.sections.length > 0, k.id);
      assert.ok(doc.methodology.length >= 5 && doc.completeness.length >= 4, k.id);
      assert.equal(doc.auditName, k.audit);
      for (const s of doc.sections) for (const r of s.rows) assert.equal(r.length, s.columns.length, `${k.id}: ${s.title}`);
    }
  });
  test("money is written the Indian way with the currency code", () => {
    assert.equal(moneyText(4740713.1, "INR"), "INR 47,40,713");
    assert.equal(moneyText(null, "INR"), "-");
    assert.equal(cellText(null, "money", "INR"), "-");
  });
  test("totals are sums of the rows the database returned", () => {
    const doc = buildReport("management", data, ctx);
    const periods = doc.sections[0];
    assert.equal(periods.total?.[7], 4740713.1);
    assert.equal(periods.total?.[3], 3, "travellers come from the database, not a sum of periods");
    const projects = doc.sections.find((s) => s.title === "Top projects")!;
    assert.equal(projects.total?.[3], 4740713.1);
    assert.equal(projects.total?.[2], null, "travellers across projects are not summed");
  });
  test("missing costs are counted, other currencies kept apart", () => {
    const doc = buildReport("financial", data, ctx);
    assert.ok(doc.completeness.some((c) => c.includes("1 booking has a blank cost")));
    assert.ok(doc.methodology.some((m) => m.includes("USD") && m.includes("never added")));
    assert.ok(doc.sections.some((s) => s.title === "Other currencies"));
  });
  test("per-person tables have no travellers column, and totals still line up", () => {
    const doc = buildReport("employee", data, ctx);
    const people = doc.sections[0];
    assert.ok(!people.columns.some((c) => c.label === "Travellers"));
    assert.equal(people.total?.length, people.columns.length);
    assert.equal(people.total?.[2], 4740713.1);
    assert.equal(people.total?.[4], 2);
  });
  test("generated time is written without a day/month mix-up", () => {
    assert.equal(generatedText("2026-11-07T03:45:00Z"), "7 Nov 2026, 9:15 am IST");
  });
  test("period names", () => {
    assert.equal(reportPeriodLabel("2026-09-07", "week"), "Week of 7 Sep 2026");
    assert.equal(reportPeriodLabel("2026-09", "month"), "Sep 2026");
    assert.equal(reportPeriodLabel("FY 2026-27 Q2", "quarter"), "FY 2026-27 Q2");
  });
  test("CSV cells cannot run as formulas", () => {
    const csv = reportToCsv(buildReport("employee", data, ctx));
    assert.ok(csv.includes("\"'=HYPERLINK"));
    assert.ok(!/(^|,)"=/m.test(csv));
    assert.ok(csv.includes("How this was calculated"));
  });
  test("Excel sheet names are valid and unique", () => {
    const used = new Set<string>();
    assert.equal(sheetName("Projects in each period: a very long title here", used).length <= 31, true);
    assert.equal(sheetName("A/B", used), "A B");
    assert.equal(sheetName("A B", used), "A B 2");
  });
  test("PDF text has no characters the built-in fonts cannot draw", () => {
    assert.equal(pdfSafe("HYD → BOM · ₹500 — ok"), "HYD to BOM - INR 500 - ok");
    assert.equal(pdfSafe("Zoë"), "Zoë");
    assert.equal(pdfSafe("名前 Ravi"), " Ravi");
  });
});
