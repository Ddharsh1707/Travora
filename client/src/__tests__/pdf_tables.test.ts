import { test } from "node:test";
import assert from "node:assert/strict";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { pagesToSheets, wordsToLines, type PdfWord } from "../lib/data/pdfTables.ts";
import { analyzeWorkbook } from "../lib/data/workbook.ts";

// Reads words out of a PDF the same way the browser does, with the Node build of pdf.js.
async function pdfWords(bytes: Uint8Array): Promise<PdfWord[][]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes, disableFontFace: true, useSystemFonts: false }).promise;
  const pages: PdfWord[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.filter((it) => "str" in it && it.str.trim()).map((it) => {
      const t = it as { str: string; transform: number[]; width: number; height: number };
      return { str: t.str, x: t.transform[4], y: t.transform[5], w: t.width, h: Math.abs(t.transform[3]) || t.height };
    }));
  }
  return pages;
}

const HEAD = ["S. No", "Travel Date", "PNR", "Passenger Name", "Sector", "Airline", "Ticket Number", "Cost", "Project", "Purpose of Visit"];
function bookingPdf(rows: number): Uint8Array {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text("AIR TICKETING - BULK BOOKINGS SEP 2026", 14, 12);
  const body: string[][] = [];
  for (let i = 1; i <= rows; i++) {
    body.push([String(i), `0${(i % 9) + 1}-09-2026`, `PN${1000 + i}`, i % 2 ? "MR. RAVI KUMAR" : "MS. SITA DEVI", "HYD-BOM", "6E", `0981${i}`, `${(10000 + i * 10).toLocaleString("en-IN")}.00`, "HRRL Refinery", "Site visit"]);
  }
  autoTable(doc, { head: [HEAD], body, startY: 18, styles: { fontSize: 8 }, showHead: "everyPage" });
  return new Uint8Array(doc.output("arraybuffer"));
}

test("words on one line become cells, split at wide gaps", () => {
  const lines = wordsToLines([
    { str: "Passenger", x: 10, y: 100, w: 40, h: 8 }, { str: "Name", x: 52, y: 100, w: 20, h: 8 },
    { str: "Cost", x: 150, y: 100.5, w: 18, h: 8 },
    { str: "RAVI", x: 10, y: 88, w: 20, h: 8 }, { str: "1,200", x: 150, y: 88, w: 22, h: 8 },
  ]);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0].chunks.map((c) => c.text), ["Passenger Name", "Cost"]);
  assert.deepEqual(lines[1].chunks.map((c) => c.text), ["RAVI", "1,200"]);
});

test("a booking table PDF over several pages reads like one sheet", async () => {
  const sheets = pagesToSheets(await pdfWords(bookingPdf(60)), "bookings");
  assert.equal(sheets.length, 1, "the repeated header on later pages continues the same table");
  const summary = analyzeWorkbook(sheets);
  assert.equal(summary.sheets[0].status, "data");
  assert.equal(summary.sheets[0].kind, "flight");
  assert.equal(summary.lines.length, 60, "every booking line is found, no header repeats");
  const first = summary.lines[0];
  assert.match(first.employee_name, /RAVI KUMAR/i);
  assert.equal(first.departure_date, "2026-09-02");
  assert.equal(first.booking_reference, "PN1001");
  assert.equal(first.destination, "BOM");
  assert.equal(Number(first.amount.replace(/,/g, "")), 10010);
  assert.equal(first.raw["Project"], "HRRL Refinery", "every column of the file is kept");
  assert.equal(first.raw["Purpose of Visit"], "Site visit");
  const total = summary.lines.reduce((s, l) => s + Number(l.amount.replace(/,/g, "")), 0);
  assert.equal(total, Array.from({ length: 60 }, (_, i) => 10000 + (i + 1) * 10).reduce((a, b) => a + b, 0), "amounts add up exactly");
});
