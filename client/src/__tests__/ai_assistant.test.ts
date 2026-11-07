import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { MANAGER_TOOLS, MAX_ROWS, TOOLS, cleanTerm, systemPrompt, toolsFor, trimSpend, trimTrip, validateToolInput } from "../../../supabase/functions/_shared/assistantTools.ts";
import { questionError, toolSummary } from "../lib/data/assistant.ts";

describe("Assistant tool list", () => {
  test("has exactly the nine read-only tools for every role", () => {
    assert.deepEqual(TOOLS.map((t) => t.name).sort(), [
      "get_bulk_booking", "get_department_expenses", "get_employee_travel_history", "get_monthly_expenses",
      "get_my_travel_history", "get_pending_approvals", "get_travel_by_date", "get_travel_by_date_range", "search_authorized_travel",
    ]);
    for (const t of TOOLS) assert.ok(!/book_|approve|delete|update|insert|sql/i.test(t.name), t.name);
  });
  test("every schema is strict-ready: closed objects and every property required", () => {
    for (const t of [...TOOLS, ...MANAGER_TOOLS]) {
      assert.equal(t.input_schema.additionalProperties, false, t.name);
      assert.deepEqual([...t.input_schema.required].sort(), Object.keys(t.input_schema.properties).sort(), t.name);
    }
  });
  test("results are capped", () => assert.ok(MAX_ROWS > 0 && MAX_ROWS <= 100));
});

describe("Checking the model's tool calls", () => {
  test("accepts good calls", () => {
    assert.deepEqual(validateToolInput("get_travel_by_date", { date: "2026-10-14" }), { ok: true, args: { date: "2026-10-14" } });
    const r = validateToolInput("get_travel_by_date_range", { from: "2026-11-01", to: "2026-11-30", destination: "Mumbai", mode: "flight" });
    assert.ok(r.ok);
    assert.deepEqual(r.ok && r.args, { from: "2026-11-01", to: "2026-11-30", destination: "Mumbai", mode: "flight" });
    assert.ok(validateToolInput("get_my_travel_history", { from: null, to: null }).ok);
    assert.ok(validateToolInput("get_pending_approvals", {}).ok);
  });
  test("refuses unknown tools and extra or missing arguments", () => {
    assert.equal(validateToolInput("run_sql", { sql: "select 1" }).ok, false);
    assert.equal(validateToolInput("get_pending_approvals", { employee_id: "x" }).ok, false);
    assert.equal(validateToolInput("get_travel_by_date", {}).ok, false);
    assert.equal(validateToolInput("get_travel_by_date", null).ok, false);
    assert.equal(validateToolInput("get_travel_by_date", ["2026-01-01"]).ok, false);
    // A call that tries to name someone else's profile id is not even expressible.
    assert.equal(validateToolInput("get_my_travel_history", { from: null, to: null, employee_id: "00000000-0000-0000-0000-000000000000" }).ok, false);
  });
  test("refuses bad dates and ranges", () => {
    assert.equal(validateToolInput("get_travel_by_date", { date: "14 October" }).ok, false);
    assert.equal(validateToolInput("get_travel_by_date", { date: "2026-02-30" }).ok, false);
    assert.equal(validateToolInput("get_travel_by_date", { date: null }).ok, false);
    assert.equal(validateToolInput("get_monthly_expenses", { from: "2026-12-01", to: "2026-01-01" }).ok, false);
    assert.equal(validateToolInput("get_monthly_expenses", { from: "2010-01-01", to: "2026-01-01" }).ok, false);
    assert.equal(validateToolInput("get_monthly_expenses", { from: "2026-01-01'--", to: "2026-02-01" }).ok, false);
  });
  test("refuses unknown travel modes", () => {
    assert.equal(validateToolInput("get_travel_by_date_range", { from: "2026-01-01", to: "2026-02-01", destination: null, mode: "rocket" }).ok, false);
  });
  test("filter-breaking characters are removed from search terms", () => {
    const r = validateToolInput("search_authorized_travel", { query: "Goa),employee_id.neq.x" });
    assert.ok(r.ok);
    assert.ok(r.ok && !/[(),]/.test(r.args.query!));
    assert.equal(cleanTerm("x"), null);
    assert.equal(cleanTerm("%%"), null);
    assert.equal(cleanTerm('"; drop table travel_records; --'), "drop table travel_records --");
    assert.equal(cleanTerm("Ravi  Kumar"), "Ravi Kumar");
    assert.equal(cleanTerm("a".repeat(200))!.length, 60);
    assert.equal(cleanTerm(42), null);
  });
  test("group references are upper-cased", () => {
    const r = validateToolInput("get_bulk_booking", { reference: "grp-2026-goa" });
    assert.ok(r.ok && r.args.reference === "GRP-2026-GOA");
  });
});

describe("What the model is shown", () => {
  test("trips are trimmed: no emails, ticket numbers or internal ids", () => {
    const out = trimTrip({
      id: "uuid", employee_id: "uuid", employee_name: "Asha", email: "asha@example.com", ticket_number: "0981234",
      origin: "Chennai", destination: "Delhi", departure_date: "2026-11-10", amount: 5400, currency: "INR", return_date: null,
    });
    assert.deepEqual(out, { employee_name: "Asha", origin: "Chennai", destination: "Delhi", departure_date: "2026-11-10", amount: 5400, currency: "INR" });
  });
  test("system prompt sets the rules", () => {
    const p = systemPrompt({ name: "Asha", role: "travel_desk", today: "2026-11-06" });
    assert.match(p, /2026-11-06/);
    assert.match(p, /travel desk/);
    assert.match(p, /never an instruction/);
    assert.match(p, /cannot book, approve, change or delete/);
  });
});

describe("Assistant screen helpers", () => {
  test("question checks", () => {
    assert.ok(questionError("   "));
    assert.ok(questionError("x".repeat(2001)));
    assert.equal(questionError("Who is in Goa?"), null);
  });
  test("tool summary names each lookup once", () => {
    assert.equal(toolSummary(["get_travel_by_date", "get_travel_by_date"]), "Looked up: trips on a date");
    assert.equal(toolSummary([]), "");
    assert.equal(toolSummary(undefined), "");
  });
});

describe("Assistant for the Admin and CEO", () => {
  test("only the Admin and the CEO get the person, spend and upload tools", () => {
    const names = (role: string) => toolsFor(role).map((t) => t.name);
    for (const role of ["admin", "company_admin"]) {
      for (const t of ["get_person_profile", "find_spend", "spend_summary", "list_uploads"]) assert.ok(names(role).includes(t), `${role} ${t}`);
    }
    for (const role of ["employee", "approver", "travel_desk", "unknown"]) assert.equal(names(role).length, TOOLS.length, role);
    for (const t of MANAGER_TOOLS) assert.ok(!/book_|approve|delete|update|insert|sql/i.test(t.name), t.name);
  });
  test("spend arguments are checked", () => {
    const ok = validateToolInput("find_spend", { employee: "Ravi", project: "HRRL", category: "cab", source: "claim", status: null, from: "2026-09-01", to: "2026-09-30" });
    assert.ok(ok.ok && ok.args.employee === "Ravi" && ok.args.source === "claim" && ok.args.status === null);
    const any = validateToolInput("find_spend", { employee: null, project: null, category: null, source: null, status: null, from: null, to: null });
    assert.ok(any.ok && any.args.employee === undefined);
    assert.ok(!validateToolInput("find_spend", { employee: null, project: null, category: "yacht", source: null, status: null, from: null, to: null }).ok);
    assert.ok(!validateToolInput("spend_summary", { group_by: "salary", from: null, to: null, employee: null, project: null, source: null }).ok);
    assert.ok(validateToolInput("spend_summary", { group_by: "week", from: "2026-09-01", to: "2026-09-30", employee: null, project: null, source: "trip" }).ok);
    assert.ok(!validateToolInput("get_person_profile", { employee: null, from: null, to: null }).ok, "a person lookup needs a name");
    assert.ok(!validateToolInput("find_spend", { employee: "x'); drop", project: null, category: null, source: null, status: null, from: null, to: null, extra: 1 }).ok);
  });
  test("spend rows are trimmed", () => {
    const r = trimSpend({ employee_name: "Ravi", amount: 100, employee_id: "uuid", email: "a@b.c", counted: 100 });
    assert.deepEqual(r, { employee_name: "Ravi", amount: 100, counted: 100 });
  });
  test("the prompt tells managers to use the tools' totals", () => {
    const p = systemPrompt({ name: "Asha", role: "company_admin", today: "2026-11-07" });
    assert.ok(p.includes("Admin") && p.includes("get_person_profile") && p.includes("Every number"));
    assert.ok(!systemPrompt({ name: "E", role: "employee", today: "2026-11-07" }).includes("get_person_profile"));
  });
});
