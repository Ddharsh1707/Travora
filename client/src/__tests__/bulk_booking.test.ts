import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { MAX_TRAVELLERS, parseEmployeeCodes } from "../lib/data/bulk.ts";

describe("Bulk booking traveller list", () => {
  test("pasted IDs are split, cleaned, upper-cased and de-duplicated", () => {
    assert.deepEqual(parseEmployeeCodes("emp001, EMP002\nEMP003;emp001\tEMP004 | EMP005"), ["EMP001", "EMP002", "EMP003", "EMP004", "EMP005"]);
  });
  test("odd characters cannot reach the query", () => {
    assert.deepEqual(parseEmployeeCodes("EMP'001 EMP\"002 <script>"), ["EMP001", "EMP002", "SCRIPT"]);
  });
  test("empty input gives nothing", () => {
    assert.deepEqual(parseEmployeeCodes("  ,, \n "), []);
  });
  test("capped at the traveller limit", () => {
    const many = Array.from({ length: 700 }, (_, i) => `E${i}`).join(",");
    assert.equal(parseEmployeeCodes(many).length, MAX_TRAVELLERS);
  });
});
