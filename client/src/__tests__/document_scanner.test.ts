import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { checkExtraction, isIsoDate, namesMatch, sniffMime, EXTRACTION_SCHEMA, TICKET_FIELDS } from "../../../supabase/functions/_shared/ticket.ts";
import { checkDocumentFile, documentPath } from "../lib/data/documents.ts";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

const TICKET_TEXT = `IndiGo E-Ticket  PNR: QX7P2L  Passenger: KUMAR/ARUN MR
6E 2134 Chennai (MAA) to Delhi (DEL) 14 Oct 2026 06:10
Ticket number 098-1234567890  Total fare INR 8,450.00`;

const GOOD = {
  document_type: "flight_ticket",
  passenger_name: "KUMAR/ARUN MR",
  origin: "Chennai",
  destination: "Delhi",
  departure_date: "2026-10-14",
  return_date: null,
  provider: "IndiGo",
  booking_reference: "QX7P2L",
  ticket_number: "098-1234567890",
  amount: 8450,
  currency: "INR",
  travel_mode: "flight",
  low_confidence_fields: [],
};

describe("Document upload checks", () => {
  test("accepts real PDFs and images", () => {
    assert.deepEqual(checkDocumentFile("ticket.pdf", 1000, PDF), { ok: true, mime: "application/pdf", ext: "pdf" });
    assert.equal(checkDocumentFile("photo.PNG", 1000, PNG).ok, true);
    assert.equal(checkDocumentFile("photo.jpeg", 1000, JPG).ok, true);
  });
  test("rejects renamed, empty, oversized and unsupported files", () => {
    assert.equal(checkDocumentFile("ticket.pdf", 1000, ZIP).ok, false);
    assert.equal(checkDocumentFile("photo.png", 1000, PDF).ok, false);
    assert.equal(checkDocumentFile("ticket.pdf", 0, PDF).ok, false);
    assert.equal(checkDocumentFile("ticket.pdf", 11 * 1024 * 1024, PDF).ok, false);
    assert.equal(checkDocumentFile("run.exe", 1000, PDF).ok, false);
    assert.equal(checkDocumentFile("ticket.pdf.exe", 1000, PDF).ok, false);
  });
  test("storage path never contains the user's filename", () => {
    const p = documentPath("00000000-0000-0000-0000-0000000000e1", "pdf", "11111111-1111-1111-1111-111111111111");
    assert.equal(p, "00000000-0000-0000-0000-0000000000e1/11111111-1111-1111-1111-111111111111.pdf");
    assert.match(documentPath("00000000-0000-0000-0000-0000000000e1", "pdf"), /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/);
  });
  test("server-side sniffing matches the browser check", () => {
    assert.equal(sniffMime(PDF), "application/pdf");
    assert.equal(sniffMime(PNG), "image/png");
    assert.equal(sniffMime(JPG), "image/jpeg");
    assert.equal(sniffMime(ZIP), null);
  });
});

describe("Ticket extraction checks", () => {
  test("schema is strict and covers every field", () => {
    assert.equal(EXTRACTION_SCHEMA.additionalProperties, false);
    for (const f of TICKET_FIELDS) assert.ok(EXTRACTION_SCHEMA.required.includes(f), f);
  });

  test("clean ticket passes with no warnings", () => {
    const r = checkExtraction(GOOD, TICKET_TEXT, "Arun Kumar");
    assert.deepEqual(r.warnings, []);
    assert.equal(r.fields.ticket_number, "0981234567890");
    assert.equal(r.flags.booking_reference, "ok");
    assert.equal(r.flags.passenger_name, "ok");
    assert.equal(r.flags.return_date, "missing");
  });

  test("values not printed on the document are flagged (made-up PNR)", () => {
    const r = checkExtraction({ ...GOOD, booking_reference: "ZZ9ZZ9" }, TICKET_TEXT, "Arun Kumar");
    assert.equal(r.flags.booking_reference, "check");
    assert.ok(r.warnings.some((w) => w.includes("PNR")));
  });

  test("passenger who is not the employee is flagged", () => {
    const r = checkExtraction(GOOD, TICKET_TEXT, "Bina Rao");
    assert.equal(r.flags.passenger_name, "check");
    assert.ok(r.warnings.some((w) => w.includes("does not match")));
  });

  test("bad dates, negative amounts and odd currencies are dropped and flagged", () => {
    const r = checkExtraction({ ...GOOD, departure_date: "14/10/2026", return_date: "2026-02-30", amount: -5, currency: "rupees" }, null, null);
    assert.equal(r.fields.departure_date, null);
    assert.equal(r.flags.departure_date, "missing");
    assert.equal(r.fields.return_date, null);
    assert.equal(r.fields.amount, null);
    assert.equal(r.flags.amount, "check");
    assert.equal(r.fields.currency, null);
  });

  test("return before travel is flagged", () => {
    const r = checkExtraction({ ...GOOD, return_date: "2026-10-01" }, null, null);
    assert.equal(r.flags.return_date, "check");
  });

  test("garbage or hostile answers cannot inject unexpected values", () => {
    const r = checkExtraction({ ...GOOD, document_type: "DROP TABLE", travel_mode: "teleport", extra: "x", origin: "A\u0000B\nC" }, null, null);
    assert.equal(r.fields.document_type, "other");
    assert.equal(r.fields.travel_mode, "other");
    assert.equal(r.fields.origin, "A B C");
    assert.equal("extra" in r.fields, false);
    const empty = checkExtraction("not an object", null, null);
    assert.equal(empty.flags.origin, "missing");
  });

  test("fields the model was unsure about are flagged", () => {
    const r = checkExtraction({ ...GOOD, low_confidence_fields: ["amount", "nonsense"] }, TICKET_TEXT, "Arun Kumar");
    assert.equal(r.flags.amount, "check");
  });

  test("helpers", () => {
    assert.ok(isIsoDate("2028-02-29"));
    assert.ok(!isIsoDate("2026-02-29"));
    assert.ok(!isIsoDate("1999-01-01"));
    assert.ok(namesMatch("KUMAR/ARUN MR", "Arun Kumar"));
    assert.ok(!namesMatch("Mr. Rao", "Arun Kumar"));
  });
});

// An IRCTC-style e-ticket with four passengers (made-up names, same layout as a real ERS).
const GROUP_TEXT = "Electronic Reservation Slip (ERS) Boarding From CHENNAI BEACH (MSB) Departure* 18:20 30-Nov-2026 To SECUNDERABAD JN (SC) "
  + "PNR 4701139913 Passenger Details: # Name Age Gender Food Choice Booking Status Current Status "
  + "1 Asha V K 19 F No Food CNF/B4/3/UB CNF/B4/3/UB 2 Ravi Teja 19 M No Food CNF/B4/2/MB CNF/B4/2/MB "
  + "3 Meena V E 19 F No Food CNF/B4/5/MB CNF/B4/5/MB 4 Kiran Dev 20 M No Food CNF/B4/6/UB CNF/B4/6/UB Total Fare: Rs. 4838/-";

describe("Tickets with several passengers", () => {
  const base = { document_type: "train_ticket", origin: "CHENNAI BEACH (MSB)", destination: "SECUNDERABAD JN (SC)", departure_date: "2026-11-30",
    return_date: null, provider: "Indian Railways", booking_reference: "4701139913", ticket_number: null, amount: 4838, currency: "INR", travel_mode: "train", low_confidence_fields: [] };

  test("the model is asked for every passenger", () => {
    assert.ok((EXTRACTION_SCHEMA.required as readonly string[]).includes("passengers"));
  });

  test("all four passengers are kept, and nobody is 'the' passenger", () => {
    const r = checkExtraction({ ...base, passenger_name: null, passengers: ["Asha V K", "Ravi Teja", "Meena V E", "Kiran Dev"] }, GROUP_TEXT, null);
    assert.deepEqual(r.fields.passengers, ["Asha V K", "Ravi Teja", "Meena V E", "Kiran Dev"]);
    assert.equal(r.fields.passenger_name, null);
    assert.ok(r.warnings.some((w) => /4 passengers/.test(w)));
  });

  test("a name that is not printed on the ticket is dropped; repeats are dropped", () => {
    const r = checkExtraction({ ...base, passenger_name: null, passengers: ["Asha V K", "Invented Person", "ASHA V K", "Ravi Teja"] }, GROUP_TEXT, null);
    assert.deepEqual(r.fields.passengers, ["Asha V K", "Ravi Teja"]);
  });

  test("one passenger: the usual single-person ticket", () => {
    const r = checkExtraction({ ...base, passenger_name: null, passengers: ["Ravi Teja"] }, GROUP_TEXT, null);
    assert.equal(r.fields.passenger_name, "Ravi Teja");
    assert.deepEqual(r.fields.passengers, ["Ravi Teja"]);
  });

  test("an older answer with only passenger_name still works", () => {
    const r = checkExtraction({ ...base, passenger_name: "Kiran Dev" }, GROUP_TEXT, null);
    assert.equal(r.fields.passenger_name, "Kiran Dev");
    assert.deepEqual(r.fields.passengers, ["Kiran Dev"]);
  });

  test("a photo (no text to check against) keeps the names, at most nine", () => {
    const many = Array.from({ length: 12 }, (_, i) => `Person Number${String.fromCharCode(65 + i)}`);
    const r = checkExtraction({ ...base, passenger_name: null, passengers: many }, null, null);
    assert.equal(r.fields.passengers.length, 9);
  });
});
