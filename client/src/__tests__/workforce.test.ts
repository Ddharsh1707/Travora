import { describe, test } from "node:test";
import assert from "node:assert";
import { WORKFORCE_TYPE_LABELS, nameDecisionFor, type NameReview } from "../lib/data/imports.ts";

// What the People step sends to the database for each traveller.
describe("Temporary workforce: People step decisions", () => {
  const base = { name_key: "LABOURER NEW ONE", profile_id: null, workforce_type: null, contractor_name: null } as Pick<NameReview, "name_key" | "decision" | "profile_id" | "workforce_type" | "contractor_name">;

  test("a new person is added as unknown unless a kind of worker is chosen", () => {
    assert.deepEqual(nameDecisionFor({ ...base, decision: "create" }), { name_key: "LABOURER NEW ONE", decision: "create", workforce_type: "unknown", contractor: null });
    assert.equal(nameDecisionFor({ ...base, decision: "create", workforce_type: "contract_worker" }).workforce_type, "contract_worker");
  });

  test("the contractor name is tidied, and a blank one is not sent", () => {
    assert.equal(nameDecisionFor({ ...base, decision: "create", contractor_name: "  Sri   Sai Labour " }).contractor, "Sri Sai Labour");
    assert.equal(nameDecisionFor({ ...base, decision: "create", contractor_name: "   " }).contractor, null);
    assert.equal(nameDecisionFor({ ...base, decision: "create", contractor_name: "x".repeat(300) }).contractor?.length, 200);
  });

  test("linking sends only the person; worker type and contractor are not changed by a link", () => {
    assert.deepEqual(nameDecisionFor({ ...base, decision: "link", profile_id: "p1", workforce_type: "temporary_worker", contractor_name: "ABC" }),
      { name_key: "LABOURER NEW ONE", decision: "link", profile_id: "p1" });
  });

  test("skip and undecided send nothing else", () => {
    assert.deepEqual(nameDecisionFor({ ...base, decision: "skip", contractor_name: "ABC" }), { name_key: "LABOURER NEW ONE", decision: "skip" });
    assert.deepEqual(nameDecisionFor({ ...base, decision: "pending" }), { name_key: "LABOURER NEW ONE", decision: "pending" });
  });

  test("every kind of worker has a plain label", () => {
    assert.deepEqual(Object.keys(WORKFORCE_TYPE_LABELS).sort(), ["contract_worker", "outsourced_worker", "permanent_employee", "temporary_worker", "unknown"]);
    assert.equal(WORKFORCE_TYPE_LABELS.unknown, "Unknown / not classified");
  });
});
