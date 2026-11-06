import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { expenseInput, generateTempPassword, personInput, summarizeExpenses } from "../lib/data/expenses.ts";

describe("Expense claims", () => {
  test("valid claim passes, bad ones are refused before the database", () => {
    assert.ok(expenseInput.safeParse({ expense_date: "2026-11-01", category: "cab", description: "Airport cab", amount: "650" }).success);
    assert.ok(!expenseInput.safeParse({ expense_date: "2026-11-01", category: "cab", description: "x", amount: "0" }).success);
    assert.ok(!expenseInput.safeParse({ expense_date: "2026-11-01", category: "cab", description: "x", amount: "-5" }).success);
    assert.ok(!expenseInput.safeParse({ expense_date: "2026-11-01", category: "yacht", description: "x", amount: "5" }).success);
    assert.ok(!expenseInput.safeParse({ expense_date: "1/11/2026", category: "cab", description: "x", amount: "5" }).success);
    assert.ok(!expenseInput.safeParse({ expense_date: "2026-11-01", category: "cab", description: "   ", amount: "5" }).success);
  });
  test("totals by status", () => {
    const t = summarizeExpenses([
      { status: "submitted", amount: 100 }, { status: "submitted", amount: 50 },
      { status: "approved", amount: 200 }, { status: "reimbursed", amount: 300 }, { status: "withdrawn", amount: 999 },
    ]);
    assert.deepEqual(t, { submitted: 150, approved: 200, reimbursed: 300, rejected: 0, submittedCount: 2 });
  });
});

describe("CEO employee management", () => {
  test("temporary passwords meet the sign-in rules", () => {
    for (let i = 0; i < 200; i++) {
      const p = generateTempPassword();
      assert.ok(p.length >= 12 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /[0-9]/.test(p), p);
    }
  });
  test("employee details are checked", () => {
    assert.ok(personInput.safeParse({ employee_id: "EMP042", full_name: "Ravi", email: "Ravi@Company.com" }).success);
    assert.equal(personInput.parse({ employee_id: "EMP042", full_name: "Ravi", email: "Ravi@Company.com" }).email, "ravi@company.com");
    assert.ok(!personInput.safeParse({ employee_id: "E", full_name: "Ravi", email: "r@c.com" }).success);
    assert.ok(!personInput.safeParse({ employee_id: "EMP 1", full_name: "Ravi", email: "r@c.com" }).success);
    assert.ok(!personInput.safeParse({ employee_id: "EMP1", full_name: "Ravi", email: "not-an-email" }).success);
  });
});
