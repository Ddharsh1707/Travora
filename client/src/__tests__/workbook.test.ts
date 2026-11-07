import test from "node:test";
import assert from "node:assert";
import { analyzeSheet, analyzeWorkbook, buildLines, displayName, personNameKey, readDate, splitRoute, splitTravellers, type SheetInput } from "../lib/data/workbook.ts";
import { readMerges } from "../lib/data/xlsxMerges.ts";
import { zipSync, strToU8 } from "fflate";

const D = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const pad = (row: unknown[], n: number) => [...row, ...Array(Math.max(0, n - row.length)).fill(null)];

// Same layout as a real travel desk workbook: title row, blank row, header on row 3,
// an unnamed remarks column next to the table, and a separate project list further right.
const AIR_HEADER = ["S. No", "Date", "PNR", "Passenger Name", "Sector ", "Airline", "Ticket Number", "OB Date (Ticket)", "IB Date (Ticket)", "Ticket booked In adv ", "Cost", "Payment Mode", "Project", "Purpose of Visit", "Consultant Name", "HOD Approval", "Travel Requistion date", "Travel Requistion raised thorugh & confirmed", null, null, "Project"];
const air: SheetInput = {
  name: "AIR TICKETING",
  merges: [{ r0: 0, c0: 0, r1: 0, c1: 7 }],
  rows: [
    pad(["AIR TICKETS"], 21),
    pad([], 21),
    AIR_HEADER,
    pad([1, D(2026, 9, 1), "AB1CDE", "MR. ARJUN TESTER", "BOM-VTZ", "6E", null, D(2026, 9, 9), null, null, 10243, "CARD", "Site Alpha", "demobilization", "ASHA", "PK", D(2026, 8, 31), "TR AND MAIL", null, null, "Site Alpha Master"], 21),
    pad([2, D(2026, 9, 1), "FG2HIJ, KL3MNO", "TESTER/ARJUN MR", "ROB-NBO-BOM", "KQ", 7065809114874, D(2026, 9, 7), null, null, 114738, "CARD", "Site Alpha", "demobilization", "ASHA", "PK", D(2026, 8, 31), "TR AND MAIL", null, null, "Site Beta Master"], 21),
    pad([3, D(2026, 9, 17), "ND4P6Q", "MR. RAVI DEMO", "HYD-MAA", "6E", null, D(2026, 9, 28), null, null, 8993, "CARD", "Site Gamma", "ANNUAL DAY", "ASHA", "YK", D(2026, 9, 17), "TR"], 21),
    pad([4, D(2026, 9, 17), "ND4P6Q", "MR. RAVI DEMO", "HYD-MAA", "6E", null, D(2026, 9, 28), null, null, 500, "CARD", "Site Gamma", "ANNUAL DAY", "ASHA", "YK", D(2026, 9, 17), "TR"], 21),
    pad([5, D(2026, 9, 19), "QR4STU", "MR. KIRAN SAMPLE", "BOM-ADD-ROB-ADD-ACC-BOM", "ET", "reissues ", D(2026, 9, 28), D(2026, 10, 3), "BUSSINESS CLASS", 72322, "CARD", "Head Office", "OFFICIAL", "ASHA", "YR", D(2026, 9, 19), "Verbal"], 21),
    pad([6, D(2026, 9, 29), "VW5XYZ", "MR. KIRAN SAMPLE", "HYD-DEL", "AI", "CANCELLED ", D(2026, 10, 4), null, null, 34575, "CARD", "Head Office", "OFFICAL", "ASHA", "YR", D(2026, 9, 29), "Verbal", "REISSUE"], 21),
    pad([7, D(2026, 9, 8), "BY6GFN", "MR. KIRAN SAMPLE", "HYD - STV", "6E", null, D(2026, 9, 9), "NO SHOW", null, 11658, "CARD", "Head Office", "OFFICIAL", "ASHA", "YK", D(2026, 9, 8), "Verbal"], 21),
    pad([8, D(2026, 9, 18), "EZ7LTX", "MR. SAI EXAMPLE", "VGA-BOM", "AI", null, D(2026, 10, 6), null, "EXTRA LUGGAGE ", 11340, "CARD", "Site Beta", "GOING TO SITE", "ASHA", "YK", D(2026, 9, 18), "TR"], 21),
  ],
};

const hotel: SheetInput = {
  name: "HOTEL",
  // Cost K8:K10 is one shared triple room; B2:O2 is the title.
  merges: [{ r0: 1, c0: 1, r1: 1, c1: 14 }, { r0: 7, c0: 10, r1: 9, c1: 10 }],
  rows: [
    pad([], 15),
    pad([null, "HOTEL"], 15),
    pad([], 15),
    ["Date", "S. No", "Passenger Name", "HOD Approval", "Travel Requistion date", "Hotel name", "Place", "Check in", "Check out", "Confirmation Number", "Cost", "Payment Mode", "Project", "Purpose of Visit", "Consultant Name"],
    [D(2026, 9, 1), 1, "MR. RAVI DEMO", "YR", D(2026, 9, 2), "Test Inn", "Tiruchirappalli", D(2026, 9, 2), D(2026, 9, 3), null, 14000, "CARD", "Head Office", "OFFICAL", "ASHA"],
    [D(2026, 9, 7), 2, "MR. SANJAY ONE, Mrs. RITA ONE", "YK", D(2026, 9, 5), "Test Inn", "HYDERABAD", D(2026, 9, 11), D(2026, 9, 13), null, 12600, "CARD", "Head Office", "OFFICAL", "ASHA"],
    [D(2026, 9, 21), 3, "MR. ANIL TWO", "YK", D(2026, 9, 21), "Test Inn", "HYDERABAD", D(2026, 9, 25), D(2026, 9, 28), null, 7875, "CARD", "Site Delta", "ANNUAL DAY", "ASHA"],
    [D(2026, 9, 21), 4, "MR. AMIT THREE", "YK", D(2026, 9, 21), "Test Inn", "HYDERABAD", D(2026, 9, 25), D(2026, 9, 28), null, 14175, "CARD", "Site Delta", "ANNUAL DAY", "ASHA"],
    [D(2026, 9, 21), 5, "MS. MOU THREE", "YK", D(2026, 9, 21), "Test Inn", "HYDERABAD", D(2026, 9, 25), D(2026, 9, 28), null, null, "CARD", null, "ANNUAL DAY", "ASHA"],
    [D(2026, 9, 21), 6, "MISS. APARNA THREE", "YK", D(2026, 9, 21), "Test Inn", "HYDERABAD", D(2026, 9, 25), D(2026, 9, 28), null, null, "CARD", null, "ANNUAL DAY", "ASHA"],
    pad([], 15),
    pad([], 15),
    pad([], 15),
    pad(["S.No.", "Names", "Onward ", "Return ", "Rooms", "Sectors ", "Flight fare /Train ", "Hotel Cost ", "PROJECTS "], 15),
    pad([1, "MR. ANIL TWO", D(2026, 9, 25), D(2026, 9, 28), "01 SINGLE ROOM", "SURAT", 20504, 7875, "Site Delta", 3], 15),
  ],
};

const busTrain: SheetInput = {
  name: "BUS AND TRAIN",
  merges: [{ r0: 4, c0: 10, r1: 5, c1: 10 }, { r0: 4, c0: 11, r1: 5, c1: 11 }],
  rows: [
    pad([], 14),
    pad([null, "Bus Tickets"], 14),
    pad([], 14),
    ["Date", "S. No", "Passenger Name", "HOD Approval", "Travel Requistion date", "Travels name", "Sector", "Confirmation Number", "OB Date", "IB Date", "Cost", "Payment Mode", "Project", "Consultant Name"],
    [D(2026, 9, 4), 1, "SUDHIR TEST", "YK", D(2026, 9, 4), "IRCTC", "SECUNDERABAD JN (SC) - SAMALKOT JN (SLO)", 4444149459, D(2026, 9, 7), null, 8200, "UPI", "Site Epsilon", "VISH"],
    [D(2026, 9, 4), 2, "P TEST", "YK", D(2026, 9, 4), "IRCTC", "SECUNDERABAD JN (SC) - SAMALKOT JN (SLO)", 4444149459, D(2026, 9, 7), null, null, null, "Site Epsilon", "VISH"],
    ["24.09.2026", 3, "VIDYA TEST", "YK", D(2026, 9, 24), "ONLINE BUS CO", "KAKINADA-HYDERABAD(BUS)", "PRAQ9OAN42490", D(2026, 9, 24), null, 1283, "ONLINE", "Site Epsilon", "VISH"],
  ],
};

const cab: SheetInput = {
  name: "CAB",
  merges: [],
  rows: [
    pad([], 13),
    pad(["CAR"], 13),
    pad([], 13),
    ["S. No", "Passenger Name", "HOD Approval", "Requisition Date", "Location", "Pick up", "Drop off", "Booking Date & Time", "Vehicle Type and Package", "Vendor", "Consultant Name", "PACKAGE", null],
    [1, "MR. KIRAN SAMPLE", "YK", D(2026, 9, 1), "DELHI", "DELHI AIRPORT", null, "02SEP26 AT 9:50", "INNOVA", "ECO", "ASHA", "08 HRS 80KMS", null],
    [2, "MR. KIRAN SAMPLE", "YK", D(2026, 9, 10), "VISAKHAPATNAM", "AIRPORT", "AS PER GUEST ADVISED", "10 SEP 26 AT 20:30", "INNOVA", "ECO", "ASHA", "08 HRS 80KMS", "11 SEP 26 IS CANCELLED"],
    [3, "Mr. Karthik(2PAX)", "YK", D(2026, 9, 28), "HYDERABAD", "BHEL ROAD", "AS PER GUEST ADVISED", D(2026, 9, 29), "INNOVA", "ECO", "VISH", "08 HRS 80KMS", null],
    [4, "Guest Four", "YK", D(2026, 9, 3), "HYDERABAD", "HOME", "AS PER GUEST ADVISED", "03 SEP 26 TO 10 SEP 26", "SEDAN", "ECO", "ASHA", "08 HRS 80KMS", null],
  ],
};

const forexTemplate: SheetInput = {
  name: "FOREX",
  merges: [],
  rows: [pad([], 10), pad(["FOREX"], 10), pad([], 10), ["Passenger Name", "FOREX Requisition Date", "Requisition Raised BY", "HOD Approval", "Approved currency", "Currency Type", "Project", "Requisition Raised (Through)", "Submission of LERMS", "Consultant Name"]],
};
const pettyCash: SheetInput = {
  name: "PETTY CASH",
  merges: [],
  rows: [pad(["PETTY CASH"], 8), pad([], 8), pad([10000], 8), [1, D(2026, 9, 22), "Train ticket for Mr Vidya", 1405, 8595, null, null, null]],
};

test("names: airline style, titles and several travellers", () => {
  assert.strictEqual(personNameKey("TESTER/ARJUN MR"), personNameKey("MR. ARJUN TESTER"));
  assert.strictEqual(personNameKey("1DUPANA/YARRAYYA MR"), personNameKey("MR. YARRAYYA DUPANA"));
  assert.strictEqual(personNameKey("MR SUDHIR GUPTA"), personNameKey("SUDHIR GUPTA"));
  assert.notStrictEqual(personNameKey("P SATHEESH"), personNameKey("SATHEESH PONNUSAMY"), "different words are never merged");
  assert.strictEqual(displayName("KETA/RAJU MR"), "Raju Keta");
  assert.strictEqual(displayName("MR. SATHEESH PONNUSAMY"), "Satheesh Ponnusamy");
  assert.deepStrictEqual(splitTravellers("MR. A ONE").note, null);
  assert.match(splitTravellers("MR. SANJAY ONE, Mrs. RITA ONE").note ?? "", /2 travellers/);
  assert.strictEqual(splitTravellers("Mr. Karthik(2PAX)").first, "Mr. Karthik");
  assert.strictEqual(splitTravellers("TESTER/ARJUN MR").note, null, "airline style is one person");
});

test("dates and routes as typed in travel sheets", () => {
  assert.deepStrictEqual(readDate("02SEP26 AT 9:50"), { date: "2026-09-02", end: "" });
  assert.deepStrictEqual(readDate("22Sep26 at 5:30PM"), { date: "2026-09-22", end: "" });
  assert.deepStrictEqual(readDate("03 SEP 26 TO 10 SEP 26"), { date: "2026-09-03", end: "2026-09-10" });
  assert.deepStrictEqual(readDate("24.09.2026"), { date: "2026-09-24", end: "" });
  assert.strictEqual(readDate("AS PER GUEST ADVISED").date, "");
  assert.strictEqual(readDate("31.02.2026").date, "", "impossible dates are not invented");
  assert.deepStrictEqual(splitRoute("HYD - JDH"), { points: ["HYD", "JDH"], origin: "HYD", destination: "JDH", route: "HYD - JDH" });
  assert.strictEqual(splitRoute("BOM-MRU-BOM").destination, "MRU");
  assert.strictEqual(splitRoute("BOM-ADD-ROB-ADD-ACC-BOM").destination, "ACC");
  assert.strictEqual(splitRoute("ROB-NBO-BOM").destination, "BOM");
  assert.deepStrictEqual(splitRoute("SECUNDERABAD JN (SC) - SAMALKOT JN (SLO)").points, ["SECUNDERABAD JN (SC)", "SAMALKOT JN (SLO)"]);
  assert.deepStrictEqual(splitRoute("KAKINADA-HYDERABAD(BUS)").points, ["KAKINADA", "HYDERABAD"]);
  assert.strictEqual(splitRoute("SECUNDERABAD TO KAKINADA TOWN").destination, "KAKINADA TOWN");
});

test("air sheet: header under a title, remarks column, separate list, status words, add-ons", () => {
  const plan = analyzeSheet(air);
  assert.strictEqual(plan.kind, "flight");
  assert.strictEqual(plan.headerRow, 3);
  assert.strictEqual(plan.dataRows, 8);
  const byHeader = Object.fromEntries(plan.columns.map((c) => [c.header, c.field]));
  assert.strictEqual(byHeader["Passenger Name"], "employee_name");
  assert.strictEqual(byHeader["OB Date (Ticket)"], "departure_date");
  assert.strictEqual(byHeader["Date"], "booking_date");
  assert.strictEqual(byHeader["Project"], "project");
  assert.strictEqual(byHeader["HOD Approval"], "approved_by");
  assert.strictEqual(byHeader["Column S (no heading)"], "remarks", "unnamed column next to the table is kept as remarks");
  assert.ok(plan.skipped.some((b) => /columns U–U/.test(b.reason)), "the project list to the right is reported, not imported");
  assert.strictEqual(byHeader["S. No"], "", "row numbers stay unmapped but are listed");

  const { lines } = buildLines(air, plan);
  assert.strictEqual(lines.length, 8);
  const [a1, a2, g1, g2, reissue, cancelled, noShowReturn, luggage] = lines;
  assert.strictEqual(a1.origin, "BOM");
  assert.strictEqual(a1.destination, "VTZ");
  assert.strictEqual(a1.departure_date, "2026-09-09");
  assert.strictEqual(a1.booking_date, "2026-09-01");
  assert.strictEqual(a1.requisition_date, "2026-08-31");
  assert.strictEqual(a1.project, "Site Alpha");
  assert.strictEqual(a1.raw["Passenger Name"], "MR. ARJUN TESTER", "every original cell is kept");
  assert.strictEqual(a2.display_name, "Arjun Tester");
  assert.strictEqual(a2.ticket_number, "7065809114874");
  assert.strictEqual(g1.line_type, "fare");
  assert.strictEqual(g2.line_type, "addon", "same person, PNR and date again = an extra charge, not a duplicate");
  assert.strictEqual(g2.amount, "500");
  assert.strictEqual(reissue.record_status, "reissued");
  assert.strictEqual(reissue.line_type, "reissue");
  assert.strictEqual(reissue.ticket_number, "", "status words are not saved as ticket numbers");
  assert.strictEqual(reissue.return_date, "2026-10-03");
  assert.strictEqual(reissue.destination, "ACC");
  assert.ok(reissue.notes.some((n) => /BUSSINESS CLASS/.test(n)));
  assert.strictEqual(cancelled.record_status, "cancelled");
  assert.ok(cancelled.notes.some((n) => /refund not recorded/.test(n)));
  assert.strictEqual(cancelled.amount, "34575", "a cancelled booking keeps its recorded cost");
  assert.strictEqual(noShowReturn.record_status, "", "NO SHOW in the return column is a note, not a status for the whole trip");
  assert.strictEqual(noShowReturn.return_date, "");
  assert.ok(noShowReturn.notes.some((n) => /Return marked "NO SHOW"/.test(n)));
  assert.strictEqual(luggage.line_type, "addon");
});

test("hotel sheet: shared room cost counted once, summary block below is not imported", () => {
  const plan = analyzeSheet(hotel);
  assert.strictEqual(plan.kind, "hotel");
  assert.strictEqual(plan.headerRow, 4);
  assert.strictEqual(plan.dataRows, 6);
  assert.ok(plan.skipped.some((b) => /second table/.test(b.reason) && b.fromRow === 14), "summary block is reported");
  const { lines } = buildLines(hotel, plan);
  assert.strictEqual(lines.length, 6);
  const [first, couple, , room, shared1, shared2] = lines;
  assert.strictEqual(first.kind, "hotel");
  assert.strictEqual(first.origin, "");
  assert.strictEqual(first.destination, "Tiruchirappalli");
  assert.strictEqual(first.provider, "Test Inn");
  assert.strictEqual(first.departure_date, "2026-09-02", "check-in is the travel date");
  assert.strictEqual(first.return_date, "2026-09-03");
  assert.strictEqual(first.line_type, "hotel");
  assert.ok(couple.notes.some((n) => /2 travellers/.test(n)));
  assert.strictEqual(room.amount, "14175");
  assert.strictEqual(shared1.amount, "");
  assert.strictEqual(shared1.amount_state, "included_in_group");
  assert.strictEqual(shared2.amount_state, "included_in_group");
  assert.strictEqual(shared1.group_key, room.group_key);
  assert.strictEqual(shared1.project, "", "a blank project is never filled in");
});

test("bus and train: travel mode per row, merged cost, text dates", () => {
  const plan = analyzeSheet(busTrain);
  const { lines } = buildLines(busTrain, plan);
  assert.strictEqual(lines[0].kind, "train");
  assert.strictEqual(lines[0].origin, "SECUNDERABAD JN (SC)");
  assert.strictEqual(lines[1].amount_state, "included_in_group");
  assert.strictEqual(lines[1].payment_mode, "UPI", "other merged cells are filled down");
  assert.strictEqual(lines[2].kind, "bus");
  assert.strictEqual(lines[2].booking_date, "2026-09-24");
  assert.strictEqual(lines[2].booking_reference, "PRAQ9OAN42490");
});

test("cab sheet: pick-up times as text, part cancellations, several passengers", () => {
  const plan = analyzeSheet(cab);
  assert.strictEqual(plan.kind, "cab");
  const { lines } = buildLines(cab, plan);
  assert.strictEqual(lines[0].departure_date, "2026-09-02");
  assert.strictEqual(lines[0].destination, "DELHI");
  assert.strictEqual(lines[0].provider, "ECO");
  assert.strictEqual(lines[0].amount, "");
  assert.strictEqual(lines[1].record_status, "", "11 Sep cancelled does not cancel the 10 Sep booking");
  assert.ok(lines[1].notes.some((n) => /Part of the booking/.test(n)));
  assert.match(lines[2].notes.join(" "), /2 travellers/);
  assert.strictEqual(lines[3].departure_date, "2026-09-03");
  assert.strictEqual(lines[3].return_date, "2026-09-10");
});

test("whole workbook: templates and sheets without headings are reported, totals add up", () => {
  const s = analyzeWorkbook([air, hotel, busTrain, cab, forexTemplate, pettyCash]);
  const status = Object.fromEntries(s.sheets.map((p) => [p.name, p.status]));
  assert.strictEqual(status["FOREX"], "empty");
  assert.strictEqual(status["PETTY CASH"], "no_header");
  assert.match(s.sheets.find((p) => p.name === "PETTY CASH")!.reason, /Nothing from this sheet is imported/);
  assert.strictEqual(s.lines.length, 8 + 6 + 3 + 4);
  assert.strictEqual(s.perSheet["AIR TICKETING"].total, 10243 + 114738 + 8993 + 500 + 72322 + 34575 + 11658 + 11340);
  assert.strictEqual(s.perSheet["HOTEL"].total, 14000 + 12600 + 7875 + 14175, "the summary block is not added again");
  assert.strictEqual(s.perSheet["HOTEL"].shared, 2);
  assert.strictEqual(s.perSheet["CAB"].withoutCost, 4);
});

test("mapping can be changed per column", () => {
  const plan = analyzeSheet(air);
  const projectCol = plan.columns.find((c) => c.header === "Project")!.index;
  const purposeCol = plan.columns.find((c) => c.header === "Purpose of Visit")!.index;
  const { lines } = buildLines(air, plan, { [projectCol]: "", [purposeCol]: "project" });
  assert.strictEqual(lines[0].project, "demobilization");
  assert.strictEqual(lines[0].raw["Project"], "Site Alpha", "an ignored column is still kept in the record");
});

test("merged cells are read from the xlsx file itself", () => {
  const wb = `<workbook xmlns:r="r"><sheets><sheet name="HOTEL &amp; STAY" sheetId="1" r:id="rId1"/><sheet name="CAB" sheetId="2" r:id="rId2"/></sheets></workbook>`;
  const rels = `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>`;
  const s1 = `<worksheet><mergeCells count="2"><mergeCell ref="K23:K25"/><mergeCell ref="B2:O2"/></mergeCells></worksheet>`;
  const zip = zipSync({ "xl/workbook.xml": strToU8(wb), "xl/_rels/workbook.xml.rels": strToU8(rels), "xl/worksheets/sheet1.xml": strToU8(s1), "xl/worksheets/sheet2.xml": strToU8("<worksheet/>") });
  const m = readMerges(zip);
  assert.deepStrictEqual(m["HOTEL & STAY"], [{ r0: 22, c0: 10, r1: 24, c1: 10 }, { r0: 1, c0: 1, r1: 1, c1: 14 }]);
  assert.deepStrictEqual(m["CAB"], []);
  assert.deepStrictEqual(readMerges(new Uint8Array([1, 2, 3])), {}, "a broken file gives no merges instead of failing");
});
