import { describe, test } from "node:test";
import assert from "node:assert";
import { VERIFICATION_LABELS, aliasInput, cleanWorkerFilters, contractorInput, evidenceInput, mergeEvidenceInput } from "../lib/data/workforce.ts";

describe("Temporary workforce: directory filters", () => {
  test("only known filters are sent", () => {
    assert.deepEqual(cleanWorkerFilters({ type: "temporary_worker", status: "verified", sort: "spend" }), { type: "temporary_worker", status: "verified", sort: "spend" });
    assert.deepEqual(cleanWorkerFilters({ type: "boss" as never, status: "fine" as never, sort: "salary" as never }), {});
    assert.deepEqual(cleanWorkerFilters({ type: "non_permanent" }), { type: "non_permanent" });
  });
  test("contractor and project accept an id or 'none', nothing else", () => {
    const id = "8c000000-0000-0000-0000-000000000001";
    assert.deepEqual(cleanWorkerFilters({ contractor: id, project: "none" }), { contractor: id, project: "none" });
    assert.deepEqual(cleanWorkerFilters({ contractor: "'; drop table x; --", project: "abc" }), {});
  });
  test("search text is trimmed and capped; flags only when on", () => {
    assert.deepEqual(cleanWorkerFilters({ q: "  ramu  ", include_inactive: false, include_merged: true }), { q: "ramu", include_merged: true });
    assert.equal((cleanWorkerFilters({ q: "x".repeat(200) }).q as string).length, 80);
    assert.deepEqual(cleanWorkerFilters({ q: "   " }), {});
  });
});

describe("Temporary workforce: what people type", () => {
  test("a spelling is tidied and must have something in it", () => {
    assert.equal(aliasInput.parse("  Ramu   L "), "Ramu L");
    assert.equal(aliasInput.safeParse(" ").success, false);
    assert.equal(aliasInput.safeParse("x".repeat(201)).success, false);
  });
  test("an empty contractor clears it", () => {
    assert.equal(contractorInput.parse("   "), "");
    assert.equal(contractorInput.parse(" Sri  Sai Labour "), "Sri Sai Labour");
  });
  test("a project and a merge each need a reason", () => {
    assert.equal(evidenceInput.safeParse("  ").success, false);
    assert.equal(evidenceInput.parse(" Work order WO-17 "), "Work order WO-17");
    assert.equal(mergeEvidenceInput.safeParse("ok").success, false);
    assert.equal(mergeEvidenceInput.safeParse("Same ID card").success, true);
  });
  test("every verification status has a plain label", () => {
    assert.deepEqual(Object.keys(VERIFICATION_LABELS).sort(), ["imported_unverified", "merged", "possible_duplicate", "verified"]);
  });
});
