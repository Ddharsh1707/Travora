import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { canAutoSave, checkExtraction, matchPassenger, parseModelJson } from "../../../supabase/functions/_shared/ticket.ts";
import { autoDecisions, findProject, presetPeople, routeFor } from "../lib/data/autoUpload.ts";
import { fieldsFromScan, type Extraction } from "../lib/data/documents.ts";
import type { NameReview } from "../lib/data/imports.ts";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
const XLSX = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

const people = [
  { id: "1", full_name: "Arun Kumar" },
  { id: "2", full_name: "Priya Sharma" },
  { id: "3", full_name: "Ravi Kumar" },
  { id: "4", full_name: "Arun Kumar Reddy" },
];

describe("Upload anything: which path a file takes", () => {
  test("sheets, PDFs and photos", () => {
    assert.deepEqual(routeFor("Sept bookings.xlsx", 1000, XLSX), { ok: true, route: "sheet" });
    assert.deepEqual(routeFor("statement.PDF", 1000, PDF), { ok: true, route: "pdf" });
    assert.deepEqual(routeFor("ticket photo.jpg", 1000, new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), { ok: true, route: "ticket" });
    assert.deepEqual(routeFor("boarding.png", 1000, PNG), { ok: true, route: "ticket" });
  });
  test("renamed and unknown files are refused", () => {
    assert.equal(routeFor("photo.png", 1000, PDF).ok, false);
    assert.equal(routeFor("notes.docx", 1000, XLSX).ok, false);
    assert.equal(routeFor("sheet.xlsx", 1000, PDF).ok, false);
  });
});

describe("Reading free-model answers", () => {
  test("plain JSON, fenced JSON and JSON with words around it", () => {
    assert.deepEqual(parseModelJson('{"origin":"Chennai"}'), { origin: "Chennai" });
    assert.deepEqual(parseModelJson('```json\n{"origin":"Delhi"}\n```'), { origin: "Delhi" });
    assert.deepEqual(parseModelJson('Here it is: {"origin":"Pune"} hope that helps'), { origin: "Pune" });
  });
  test("garbage gives null", () => {
    assert.equal(parseModelJson(""), null);
    assert.equal(parseModelJson("no json"), null);
    assert.equal(parseModelJson("[1,2]"), null);
    assert.equal(parseModelJson(null), null);
  });
});

describe("Finding whose ticket it is", () => {
  test("SURNAME/FIRST MR matches the one employee", () => {
    assert.equal(matchPassenger("KUMAR/ARUN MR", people)?.id, "1");
    assert.equal(matchPassenger("Ms. Priya Sharma", people)?.id, "2");
  });
  test("the fuller name wins when it is on the ticket", () => {
    assert.equal(matchPassenger("REDDY/ARUN KUMAR", people)?.id, "4");
  });
  test("no match or two equal matches: a person decides", () => {
    assert.equal(matchPassenger("KUMAR MR", people), null);
    assert.equal(matchPassenger("John Doe", people), null);
    assert.equal(matchPassenger(null, people), null);
    assert.equal(matchPassenger("Arun Kumar", [...people, { id: "5", full_name: "Kumar Arun" }]), null);
  });
});

describe("Saving a scan without a person", () => {
  const raw = {
    document_type: "flight_ticket", passenger_name: "KUMAR/ARUN MR", origin: "Chennai", destination: "Delhi",
    departure_date: "2026-10-14", return_date: null, provider: "IndiGo", booking_reference: "QX7P2L",
    ticket_number: "0981234567890", amount: 8450, currency: "INR", travel_mode: "flight", low_confidence_fields: [],
  };
  test("clear scans are saved", () => {
    assert.equal(canAutoSave(checkExtraction(raw, null, null)), true);
  });
  test("a missing or unsure route or date is left for review", () => {
    assert.equal(canAutoSave(checkExtraction({ ...raw, destination: null }, null, null)), false);
    assert.equal(canAutoSave(checkExtraction({ ...raw, departure_date: "14/10/2026" }, null, null)), false);
    assert.equal(canAutoSave(checkExtraction({ ...raw, low_confidence_fields: ["origin"] }, null, null)), false);
    // An unsure PNR alone does not stop the save; it is shown as a note.
    assert.equal(canAutoSave(checkExtraction({ ...raw, low_confidence_fields: ["booking_reference"] }, null, null)), true);
  });
  test("the confirm fields come from the scan", () => {
    const ex = { ...checkExtraction(raw, null, null), method: "text", extracted_at: "" } as unknown as Extraction;
    const f = fieldsFromScan(ex, "other");
    assert.equal(f.origin, "Chennai");
    assert.equal(f.amount, "8450");
    assert.equal(f.booking_type, "flight");
    assert.equal(f.document_type, "flight_ticket");
  });
});

describe("Workbook decisions made automatically", () => {
  const review = (over: Partial<NameReview>): NameReview => ({
    id: 1, name_key: "k", display_name: "X", raw_names: [], employee_code: null, department: null, row_count: 1,
    suggested_profile_id: null, match_reason: null, decision: "pending", profile_id: null, ...over,
  });
  test("same-name employees are linked, others added or left out", () => {
    const out = autoDecisions([review({ name_key: "a", suggested_profile_id: "p1" }), review({ name_key: "b" })], true);
    assert.deepEqual(out, [
      { name_key: "a", decision: "link", profile_id: "p1" },
      { name_key: "b", decision: "create", profile_id: null, workforce_type: "unknown" },
    ]);
    assert.equal(autoDecisions([review({ name_key: "b" })], false)[0].decision, "skip");
  });
  test("'ask me': someone who may already be on file is never added automatically", () => {
    const candidate = { profile_id: "p2", full_name: "Ravi Kumar", employee_id: "E2", workforce_type: "permanent_employee" as const, active: true, reason: "Initials match" };
    assert.deepEqual(autoDecisions([review({ name_key: "KUMAR R", candidates: [candidate] })], true)[0], { name_key: "KUMAR R", decision: "pending", profile_id: null });
    assert.equal(autoDecisions([review({ name_key: "x", candidates: [] })], true)[0].decision, "create", "no possible match: added as before");
  });
  test("'add to temporary workforce': matches are linked, everyone else is a temporary worker", () => {
    const candidate = { profile_id: "p2", full_name: "Ravi Kumar", employee_id: "E2", workforce_type: "permanent_employee" as const, active: true, reason: "Initials match" };
    const out = autoDecisions([
      review({ name_key: "a", suggested_profile_id: "p1" }),
      review({ name_key: "b" }),
      review({ name_key: "KUMAR R", candidates: [candidate] }),
    ], true, "temporary_worker");
    assert.deepEqual(out, [
      { name_key: "a", decision: "link", profile_id: "p1" },
      { name_key: "b", decision: "create", profile_id: null, workforce_type: "temporary_worker" },
      { name_key: "KUMAR R", decision: "create", profile_id: null, workforce_type: "temporary_worker" },
    ], "a near-name is added too; the database marks it Possible duplicate");
  });
  test("'add as permanent employees': everyone not found is a permanent employee; matches are still linked", () => {
    const out = autoDecisions([review({ name_key: "a", suggested_profile_id: "p1" }), review({ name_key: "b" })], true, "permanent_employee");
    assert.deepEqual(out.map((d) => [d.decision, d.workforce_type ?? null]), [["link", null], ["create", "permanent_employee"]]);
  });
  test("with adding switched off, nobody is added whatever the choice", () => {
    for (const mode of ["temporary_worker", "permanent_employee", "ask"] as const) {
      assert.equal(autoDecisions([review({ name_key: "b" })], false, mode)[0].decision, "skip", mode);
    }
  });
  test("step by step: the People step is filled in from the choice and can still be changed", () => {
    const candidate = { profile_id: "p2", full_name: "Ravi Kumar", employee_id: "E2", workforce_type: "permanent_employee" as const, active: true, reason: "Initials match" };
    const rows = [
      review({ name_key: "a", decision: "link", profile_id: "p1", suggested_profile_id: "p1" }),
      review({ name_key: "b", decision: "create" }),
      review({ name_key: "KUMAR R", decision: "pending", candidates: [candidate] }),
    ];
    const out = presetPeople(rows, true, "permanent_employee");
    assert.deepEqual(out.map((r) => [r.name_key, r.decision, r.workforce_type ?? null]), [
      ["a", "link", null], ["b", "create", "permanent_employee"], ["KUMAR R", "create", "permanent_employee"],
    ]);
    assert.strictEqual(presetPeople(rows, true, "ask"), rows, "'ask me' leaves the People step as it was");
    assert.strictEqual(presetPeople(rows, false, "temporary_worker"), rows, "nothing is preset when adding is switched off");
  });
  test("an earlier link is kept", () => {
    assert.deepEqual(autoDecisions([review({ decision: "link", profile_id: "p9", suggested_profile_id: "p1" })], true)[0], { name_key: "k", decision: "link", profile_id: "p9" });
  });
  test("project names match ignoring case and punctuation", () => {
    const projects = [{ id: "x", name: "Nellore Solar Plant", code: "NSP-01" }, { id: "y", name: "Head Office", code: null }];
    assert.equal(findProject("NELLORE  solar-plant", projects), "x");
    assert.equal(findProject("nsp 01", projects), "x");
    assert.equal(findProject("head office.", projects), "y");
    assert.equal(findProject("Vizag Port", projects), null);
    assert.equal(findProject("  ", projects), null);
  });
});

describe("Tickets with several passengers", async () => {
  const { planGroupTicket, planReady, splitAmount, isGroupTicket } = await import("../lib/data/autoUpload.ts");
  const people = [
    { id: "p1", full_name: "Ravi Teja", employee_id: "E1", department: null },
    { id: "p2", full_name: "Kiran Dev", employee_id: "E2", department: null },
  ];
  const ex = (over: Record<string, unknown> = {}) => ({
    method: "text", model: "x", extracted_at: "", flags: {}, warnings: [],
    fields: { passenger_name: null, passengers: ["Asha V K", "Ravi Teja", "Kiran Dev"], origin: "MAS", destination: "SC", departure_date: "2026-11-30",
      return_date: null, provider: "Indian Railways", booking_reference: "4701139913", ticket_number: null, amount: 4838, currency: "INR", travel_mode: "train", ...over },
  }) as never;

  test("a group ticket needs 2+ passengers, a PNR, a route and a date", () => {
    assert.equal(isGroupTicket(ex()), true);
    assert.equal(isGroupTicket(ex({ passengers: ["Ravi Teja"] })), false, "one passenger: the usual flow");
    assert.equal(isGroupTicket(ex({ booking_reference: null })), false, "no PNR: choose one person instead");
    assert.equal(isGroupTicket(ex({ departure_date: null })), false);
  });

  test("passengers in the app are matched; others follow the upload choice", () => {
    const temp = planGroupTicket(["Asha V K", "Ravi Teja", "Kiran Dev"], people, "temporary_worker", true);
    assert.deepEqual(temp.map((p) => [p.name, p.person?.id ?? null, p.add]), [["Asha V K", null, "temporary_worker"], ["Ravi Teja", "p1", null], ["Kiran Dev", "p2", null]]);
    assert.equal(planReady(temp), true, "nothing to ask: saved at once");
    const ask = planGroupTicket(["Asha V K", "Ravi Teja"], people, "ask", true);
    assert.deepEqual(ask[0], { name: "Asha V K", person: null, add: null });
    assert.equal(planReady(ask), false, "'ask me': a person chooses first");
    const desk = planGroupTicket(["Asha V K"], people, "permanent_employee", false);
    assert.equal(desk[0].add, null, "the booking assistant never adds a kind of worker automatically");
  });

  test("leaving someone out is a decision; leaving everyone out is not a booking", () => {
    const plan = planGroupTicket(["Asha V K", "Ravi Teja"], people, "ask", true);
    assert.equal(planReady([{ ...plan[0], leaveOut: true }, plan[1]]), true);
    assert.equal(planReady(plan.map((p) => ({ ...p, leaveOut: true }))), false);
  });

  test("the fare is split so the shares add up exactly to the total", () => {
    assert.deepEqual(splitAmount(4838, 4), [1209.5, 1209.5, 1209.5, 1209.5]);
    assert.deepEqual(splitAmount(100, 3), [33.34, 33.33, 33.33]);
    const s = splitAmount(4838.35, 4) as number[];
    assert.equal(Math.round(s.reduce((a, b) => a + b, 0) * 100), 483835, "never more or less than the ticket total");
    assert.deepEqual(splitAmount(null, 2), [null, null], "no fare on the ticket: no amounts invented");
  });
});
