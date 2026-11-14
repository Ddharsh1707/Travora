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

describe("Temporary workforce: analytics filters", async () => {
  const { cleanAnalyticsFilters } = await import("../lib/data/workforce.ts");
  test("only real dates and ids are sent, and a reversed range is put the right way round", () => {
    assert.deepEqual(cleanAnalyticsFilters({ from: "2026-10-31", to: "2026-10-01" }), { from: "2026-10-01", to: "2026-10-31" });
    assert.deepEqual(cleanAnalyticsFilters({ from: "31/10/2026", project: "x", contractor: "none" }), { contractor: "none" });
    assert.deepEqual(cleanAnalyticsFilters({ project: "9d000000-0000-0000-0000-000000000001" }), { project: "9d000000-0000-0000-0000-000000000001" });
  });
});

describe("Temporary workforce: bulk changes", async () => {
  const { applyToWorkers } = await import("../lib/data/workforce.ts");
  const person = (id: string, over: Record<string, unknown> = {}) =>
    ({ id, full_name: `P ${id}`, workforce_type: "unknown", verification_status: "imported_unverified", has_login: false, ...over }) as Parameters<typeof applyToWorkers>[0][number];

  test("sets the kind and verifies each person, through the checked functions", async () => {
    const calls: string[] = [];
    const api = { setType: async (id: string, t: string) => { calls.push(`type:${id}:${t}`); }, verify: async (id: string) => { calls.push(`verify:${id}`); } };
    const r = await applyToWorkers([person("a"), person("b")], { workforce_type: "permanent_employee", verify: true }, api);
    assert.deepEqual(r, { changed: 2, failed: [] });
    assert.deepEqual(calls, ["type:a:permanent_employee", "verify:a", "type:b:permanent_employee", "verify:b"]);
  });

  test("skips what is already so, and keeps going when one person is refused", async () => {
    const calls: string[] = [];
    const api = {
      setType: async (id: string) => { if (id === "b") throw new Error("You cannot change this person's record"); calls.push(`type:${id}`); },
      verify: async (id: string) => { calls.push(`verify:${id}`); },
    };
    const r = await applyToWorkers([
      person("a", { workforce_type: "permanent_employee", verification_status: "verified" }),
      person("b"),
      person("c"),
    ], { workforce_type: "permanent_employee", verify: true }, api);
    assert.equal(r.changed, 1);
    assert.deepEqual(r.failed.map((f) => [f.id, f.reason]), [["b", "You cannot change this person's record"]]);
    assert.deepEqual(calls, ["type:c", "verify:c"], "nothing is sent for a person who is already set");
  });

  test("someone with a login is never made anything but permanent", async () => {
    let sent = false;
    const api = { setType: async () => { sent = true; }, verify: async () => undefined };
    const r = await applyToWorkers([person("a", { workforce_type: "permanent_employee", has_login: true })], { workforce_type: "temporary_worker" }, api);
    assert.equal(sent, false);
    assert.equal(r.failed.length, 1);
  });
});
