import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { canAutoSave, checkExtraction, matchPassenger, parseModelJson } from "../../../supabase/functions/_shared/ticket.ts";
import { autoDecisions, findProject, routeFor } from "../lib/data/autoUpload.ts";
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
      { name_key: "b", decision: "create", profile_id: null },
    ]);
    assert.equal(autoDecisions([review({ name_key: "b" })], false)[0].decision, "skip");
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
