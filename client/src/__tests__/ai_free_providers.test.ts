import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { MANAGER_TOOLS, TOOLS, fillOptional, forModel, systemPrompt, toOpenAITool, toolsFor, validateToolInput } from "../../../supabase/functions/_shared/assistantTools.ts";
import { allColumns, answerLines, answerReport, sectionFor } from "../lib/assistantReport.ts";
import { reportToCsv } from "../lib/reportDoc.ts";

describe("Free AI providers (Groq, Gemini)", () => {
  test("tools convert to the OpenAI format with nullable fields made optional", () => {
    const find = MANAGER_TOOLS.find((t) => t.name === "find_spend")!;
    const t = toOpenAITool(find);
    assert.equal(t.type, "function");
    assert.equal(t.function.name, "find_spend");
    assert.deepEqual(t.function.parameters.required, []);
    const props = t.function.parameters.properties as Record<string, Record<string, unknown>>;
    assert.equal(props.category.type, "string");
    assert.ok(Array.isArray(props.category.enum));
    for (const p of Object.values(props)) assert.ok(!("anyOf" in p), "no anyOf left");
    const sum = toOpenAITool(MANAGER_TOOLS.find((x) => x.name === "spend_summary")!);
    assert.deepEqual(sum.function.parameters.required, ["group_by"]);
  });
  test("every tool converts", () => {
    for (const t of [...TOOLS, ...MANAGER_TOOLS]) assert.equal(toOpenAITool(t).function.name, t.name);
  });
  test("left-out optional fields are filled with null so the strict check passes", () => {
    const input = fillOptional("find_spend", { employee: "Ravi", source: "" });
    assert.deepEqual(input, { employee: "Ravi", project: null, category: null, source: null, status: null, from: null, to: null });
    assert.ok(validateToolInput("find_spend", input).ok);
    // Required fields are not invented.
    assert.equal(validateToolInput("spend_summary", fillOptional("spend_summary", {})).ok, false);
    // Garbage stays garbage.
    assert.equal(fillOptional("find_spend", null), null);
    assert.equal(validateToolInput("find_spend", fillOptional("find_spend", { sql: "drop table" })).ok, false);
  });
  test("the model sees a short list with a note, the download keeps everything", () => {
    const out = { count: 300, trips: Array.from({ length: 300 }, (_, i) => ({ i })), totals: { amount: 5 } };
    const seen = forModel(out, 20);
    assert.equal((seen.trips as unknown[]).length, 20);
    assert.match(String(seen.trips_note), /20 of 300/);
    assert.deepEqual(seen.totals, { amount: 5 });
    assert.equal(out.trips.length, 300);
  });
});

describe("New lookups for the Director and Travel Desk", () => {
  test("only managers get them", () => {
    const names = toolsFor("admin").map((t) => t.name);
    for (const n of ["company_overview", "list_employees", "list_travel_requests", "list_tickets", "list_projects"]) {
      assert.ok(names.includes(n as never), n);
      assert.ok(!toolsFor("employee").some((t) => t.name === n), n);
      assert.ok(!toolsFor("approver").some((t) => t.name === n), n);
    }
    assert.ok(toolsFor("company_admin").some((t) => t.name === "list_tickets"));
  });
  test("arguments are checked", () => {
    assert.ok(validateToolInput("company_overview", {}).ok);
    assert.ok(validateToolInput("list_employees", { employee_status: "past", department: null, role: "company_admin", search: null }).ok);
    assert.equal(validateToolInput("list_employees", { employee_status: "everyone", department: null, role: null, search: null }).ok, false);
    assert.equal(validateToolInput("list_employees", { employee_status: "all", department: null, role: "superuser", search: null }).ok, false);
    assert.equal(validateToolInput("list_employees", { employee_status: "all", department: null, role: null, search: "%') or 1=1" }).ok, true);
    const r = validateToolInput("list_employees", { employee_status: "all", department: null, role: null, search: "%') or (1=1" });
    assert.ok(r.ok && !/[%'()=]/.test(r.args.search ?? ""), "filter characters are removed");
    assert.ok(validateToolInput("list_travel_requests", { request_status: "pending", employee: null, project: null, from: null, to: null }).ok);
    assert.equal(validateToolInput("list_travel_requests", { request_status: "lost", employee: null, project: null, from: null, to: null }).ok, false);
    assert.ok(validateToolInput("list_tickets", { employee: "EMP001", from: "2026-01-01", to: "2026-12-31" }).ok);
    assert.ok(validateToolInput("list_projects", { search: null }).ok);
  });
  test("the manager prompt mentions the new tools and the downloads", () => {
    const p = systemPrompt({ name: "D", role: "admin", today: "2026-11-09" });
    assert.match(p, /list_travel_requests/);
    assert.match(p, /download/i);
    assert.doesNotMatch(systemPrompt({ name: "E", role: "employee", today: "2026-11-09" }), /list_travel_requests/);
  });
});

describe("Downloading an answer", () => {
  const records = [{ tool: "list_travel_requests", rows: [
    { employee_name: "Ravi", employee_code: "EMP001", destination: "Mumbai", estimated_cost: 4500, ticket_attached: false, nested: { x: 1 } },
    { employee_name: "Asha", employee_code: "EMP002", destination: "Delhi", estimated_cost: 5500.5, ticket_attached: true },
  ] }];
  test("columns skip nested values", () => assert.deepEqual(allColumns(records[0].rows), ["employee_name", "employee_code", "destination", "estimated_cost", "ticket_attached"]));
  test("money columns get a total and booleans read Yes/No", () => {
    const s = sectionFor(records[0])!;
    assert.equal(s.title, "Travel requests");
    assert.equal(s.columns[3].kind, "money");
    assert.equal(s.rows[0][4], "No");
    assert.deepEqual(s.total, ["Total", null, null, 10000.5, null]);
  });
  test("the report carries the question, the answer and every row", () => {
    const doc = answerReport("Pending requests?", "**Two** requests:\n\n- Ravi\n- Asha\n|---|", records, new Date("2026-11-09T06:00:00Z"));
    assert.deepEqual(doc.summary, ["Two requests:", "- Ravi", "- Asha"]);
    assert.equal(doc.sections[0].rows.length, 2);
    assert.match(doc.fileName, /^trapple-ai-answer-202611090600$/);
    const csv = reportToCsv(doc);
    assert.match(csv, /Answer/);
    assert.match(csv, /Ravi/);
  });
  test("an answer without records still downloads", () => {
    const doc = answerReport("Hi", "Hello", []);
    assert.equal(doc.sections.length, 0);
    assert.ok(answerLines("# Title\n\n`x`").includes("Title"));
  });
});
