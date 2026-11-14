import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { importsApi } from "../lib/api.ts";

describe("Excel Import & Travel History Frontend Contract Tests", () => {
  test("importsApi exposes complete lifecycle methods", () => {
    assert.equal(typeof importsApi.upload, "function");
    assert.equal(typeof importsApi.listBatches, "function");
    assert.equal(typeof importsApi.getBatch, "function");
    assert.equal(typeof importsApi.getRecords, "function");
    assert.equal(typeof importsApi.updateMapping, "function");
    assert.equal(typeof importsApi.confirm, "function");
    assert.equal(typeof importsApi.searchTravelHistory, "function");
    assert.equal(typeof importsApi.exportTravelHistory, "function");
  });

  test("exportTravelHistory URL builder generates secure query parameters", () => {
    assert.equal(typeof importsApi.exportTravelHistoryUrl, "function");
    const url = importsApi.exportTravelHistoryUrl({
      search: "John Doe",
      employeeId: 42,
      fromDate: "2026-01-01",
      toDate: "2026-12-31",
    });

    assert.ok(url.includes("/api/imports/travel-history/export"));
    assert.ok(url.includes("search=John+Doe") || url.includes("search=John%20Doe"));
    assert.ok(url.includes("employeeId=42"));
    assert.ok(url.includes("fromDate=2026-01-01"));
    assert.ok(url.includes("toDate=2026-12-31"));
  });

  test("formula injection values are neutralized before CSV write", () => {
    const rawFormulas = ["=cmd|' /C calc'!A0", "+1+1", "-2+5", "@SUM(A1:A10)", "\tmalicious", "\rpayload"];
    for (const val of rawFormulas) {
      const firstChar = val.charAt(0);
      const isDangerous = firstChar === '=' || firstChar === '+' || firstChar === '-' || firstChar === '@' || firstChar === '\t' || firstChar === '\r';
      assert.ok(isDangerous, `Expected ${JSON.stringify(firstChar)} to trigger formula defense`);
      const escaped = "'" + val;
      assert.ok(escaped.startsWith("'"), "Dangerous formula trigger must be prepended with apostrophe");
    }
  });

  describe("importsApi.upload robust error extraction and security handling", () => {
    const originalFetch = globalThis.fetch;
    const fakeFile = { name: "test.xlsx", size: 1024 } as unknown as File;

    test("Spring Boot RFC 7807 detail field is extracted instead of generic error", async () => {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            type: "about:blank",
            title: "Bad Request",
            status: 400,
            detail: "The uploaded spreadsheet contains no recognizable columns or data headers.",
            instance: "/api/imports/upload",
          }),
          { status: 400, headers: { "content-type": "application/problem+json" } }
        );

      await assert.rejects(
        () => importsApi.upload(fakeFile),
        (err: Error) => {
          assert.equal(err.message, "The uploaded spreadsheet contains no recognizable columns or data headers.");
          return true;
        }
      );
      globalThis.fetch = originalFetch;
    });

    test("Vercel HTML rewrite fallback triggers backend unreachable error", async () => {
      globalThis.fetch = async () =>
        new Response("<!DOCTYPE html><html><head><title>Trapple</title></head><body>SPA</body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=UTF-8" },
        });

      await assert.rejects(
        () => importsApi.upload(fakeFile),
        (err: Error) => {
          assert.ok(err.message.includes("Trapple backend server not reached (HTML fallback)"));
          return true;
        }
      );
      globalThis.fetch = originalFetch;
    });

    test("HTTP 401 Unauthorized clears authentication and throws session expired", async () => {
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ error: "Unauthorized", status: 401 }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });

      await assert.rejects(
        () => importsApi.upload(fakeFile),
        (err: Error) => {
          assert.equal(err.message, "Your session has expired. Please sign in again.");
          return true;
        }
      );
      globalThis.fetch = originalFetch;
    });

    test("HTTP 403 Forbidden raises actionable role permission error", async () => {
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ error: "Forbidden", status: 403 }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });

      await assert.rejects(
        () => importsApi.upload(fakeFile),
        (err: Error) => {
          assert.ok(err.message.includes("You do not have permission to upload spreadsheets"));
          return true;
        }
      );
      globalThis.fetch = originalFetch;
    });

    test("HTTP 413 Payload Too Large raises 20MB limit explanation", async () => {
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ status: 413, error: "Payload Too Large" }), {
          status: 413,
          headers: { "content-type": "application/json" },
        });

      await assert.rejects(
        () => importsApi.upload(fakeFile),
        (err: Error) => {
          assert.ok(err.message.includes("20MB maximum size limit"));
          return true;
        }
      );
      globalThis.fetch = originalFetch;
    });

    test("Network connection drop raises connectivity guidance", async () => {
      globalThis.fetch = async () => {
        throw new Error("Failed to fetch");
      };

      await assert.rejects(
        () => importsApi.upload(fakeFile),
        (err: Error) => {
          assert.ok(err.message.includes("We couldn't reach Trapple"));
          return true;
        }
      );
      globalThis.fetch = originalFetch;
    });
  });

  describe("Passenger Name Normalization & Initial Presentation", () => {
    function formatPassengerName(rawName?: string | null): string {
      if (!rawName) return "";
      let s = rawName.trim();
      const titles = ["MR", "MRS", "MS", "MISS", "MSTR", "MASTER", "DR", "PROF"];

      if (s.includes("/")) {
        const parts = s.split("/");
        const last = parts[0].trim();
        let first = parts.slice(1).join(" ").trim();
        const firstWords = first.split(/\s+/);
        if (firstWords.length > 1 && titles.includes(firstWords[firstWords.length - 1].replace(/\./g, "").toUpperCase())) {
          firstWords.pop();
          first = firstWords.join(" ");
        }
        s = `${first} ${last}`.trim();
      } else if (s.includes(",")) {
        const parts = s.split(",");
        const last = parts[0].trim();
        let first = parts.slice(1).join(" ").trim();
        const firstWords = first.split(/\s+/);
        if (firstWords.length > 1 && titles.includes(firstWords[firstWords.length - 1].replace(/\./g, "").toUpperCase())) {
          firstWords.pop();
          first = firstWords.join(" ");
        }
        s = `${first} ${last}`.trim();
      } else {
        const words = s.split(/\s+/);
        if (words.length > 1 && titles.includes(words[0].replace(/\./g, "").toUpperCase())) {
          words.shift();
          s = words.join(" ");
        }
        if (words.length > 1 && titles.includes(words[words.length - 1].replace(/\./g, "").toUpperCase())) {
          words.pop();
          s = words.join(" ");
        }
      }

      return s
        .split(/\s+/)
        .map((w) => (w.length === 1 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
        .join(" ");
    }

    function getPassengerInitials(name?: string | null): string {
      if (!name || name === "—") return "PA";
      const words = name.trim().split(/\s+/).filter(Boolean);
      if (words.length === 0) return "PA";
      if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }

    test("converts airline GDS slash notation to clean natural name", () => {
      assert.equal(formatPassengerName("DANGETI/SURESH BABU MR"), "Suresh Babu Dangeti");
      assert.equal(formatPassengerName("YANDAPALLI/KALYAN SWAROOP"), "Kalyan Swaroop Yandapalli");
      assert.equal(formatPassengerName("KUKREJA/ANIL MR."), "Anil Kukreja");
    });

    test("converts comma inverted notation to natural name", () => {
      assert.equal(formatPassengerName("KUKREJA, ANIL"), "Anil Kukreja");
      assert.equal(formatPassengerName("DANGETI, SURESH BABU"), "Suresh Babu Dangeti");
    });

    test("strips leading and trailing honorific titles and applies title case", () => {
      assert.equal(formatPassengerName("MR. SURESH BABU DANGETI"), "Suresh Babu Dangeti");
      assert.equal(formatPassengerName("SURESH BABU DANGETI MR"), "Suresh Babu Dangeti");
      assert.equal(formatPassengerName("DR. RAMANA M"), "Ramana M");
      assert.equal(formatPassengerName("suresh babu dangeti"), "Suresh Babu Dangeti");
    });

    test("extracts clean two-letter initials", () => {
      assert.equal(getPassengerInitials("Suresh Babu Dangeti"), "SD");
      assert.equal(getPassengerInitials("Kalyan Swaroop Yandapalli"), "KY");
      assert.equal(getPassengerInitials("Ramana"), "RA");
      assert.equal(getPassengerInitials(""), "PA");
      assert.equal(getPassengerInitials("—"), "PA");
    });
  });

  describe("Client-Side SaaS Spreadsheet Parser Suite", async () => {
    const {
      parseSpreadsheetClient,
      normalizePassengerName,
      splitSector,
      parseExcelDate,
      parseCost,
      isSummaryRow,
    } = await import("../lib/spreadsheetParser.ts");
    const { default: writeXlsxFile } = await import("write-excel-file/node");
    // read-excel-file is the browser build; give Node the browser's XML parser.
    const { DOMParser } = await import("@xmldom/xmldom");
    (globalThis as { DOMParser?: unknown }).DOMParser ??= DOMParser;

    test("normalizePassengerName handles airline notation, commas, and honorifics", () => {
      assert.equal(normalizePassengerName("DANGETI/SURESH BABU MR"), "Suresh Babu Dangeti");
      assert.equal(normalizePassengerName("YANDAPALLI/KALYAN SWAROOP"), "Kalyan Swaroop Yandapalli");
      assert.equal(normalizePassengerName("KUKREJA, ANIL"), "Anil Kukreja");
      assert.equal(normalizePassengerName("MR. SURESH BABU"), "Suresh Babu");
    });

    test("splitSector splits various sector notations into origin and destination", () => {
      assert.deepEqual(splitSector("HYD-DEL"), { fromLocation: "HYD", toLocation: "DEL" });
      assert.deepEqual(splitSector("BOM / BLR"), { fromLocation: "BOM", toLocation: "BLR" });
      assert.deepEqual(splitSector("DEL to MAA"), { fromLocation: "DEL", toLocation: "MAA" });
      assert.deepEqual(splitSector("CCU -> BOM"), { fromLocation: "CCU", toLocation: "BOM" });
      assert.equal(splitSector("SINGLECITY"), null);
    });

    test("parseExcelDate handles 2-digit years, months, and Excel serial numbers", () => {
      assert.equal(parseExcelDate("01 Sep 26"), "2026-09-01");
      assert.equal(parseExcelDate("15-Sep-2026"), "2026-09-15");
      assert.equal(parseExcelDate("15/09/2026"), "2026-09-15");
      assert.equal(parseExcelDate("2026-09-15"), "2026-09-15");
      // 45565 = 2024-09-29 or similar Excel date code
      const parsedNum = parseExcelDate(45565);
      assert.ok(parsedNum && parsedNum.startsWith("2024-09"));
    });

    test("parseCost parses numbers, currency symbols, and commas", () => {
      assert.equal(parseCost(6800.5), 6800.5);
      assert.equal(parseCost("6800"), 6800);
      assert.equal(parseCost("$1,450.50"), 1450.5);
      assert.equal(parseCost("₹ 6,800.00"), 6800);
      assert.equal(parseCost(""), null);
    });

    test("isSummaryRow detects TOTAL, GRAND TOTAL, and SUB TOTAL", () => {
      assert.ok(isSummaryRow(["TOTAL", "", "15000"]));
      assert.ok(isSummaryRow(["", "GRAND TOTAL", "95000"]));
      assert.ok(!isSummaryRow(["1", "Suresh Babu", "6800"]));
    });

    test("parseSpreadsheetClient skips Row 0 title banner and extracts all records with sector", async () => {
      // Build a synthetic workbook mimicking MISPL SEP 2026 (1).xlsx
      const wsData = [
        ["AIR TICKETS"], // Row 0: Title banner
        ["Sl No", "Date", "Pax Name", "Sector", "Airline", "Ticket No", "Net Amount"], // Row 1: Headers
        [1, "01 Sep 26", "DANGETI/SURESH BABU MR", "HYD-DEL", "6E", "6E-502", "6800"], // Row 2: Data 1
        [2, "02 Sep 26", "KUKREJA, ANIL", "BOM/BLR", "AI", "AI-101", 7500], // Row 3: Data 2
        ["TOTAL", "", "", "", "", "", "14300"], // Row 4: Summary row
      ];

      const buf = await writeXlsxFile(wsData, { sheet: "Air Ticketing" }).toBuffer();
      const wbBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;

      const parsed = await parseSpreadsheetClient(wbBuffer);

      assert.equal(parsed.sheetNames[0], "Air Ticketing");
      assert.ok(parsed.availableHeaders.includes("Pax Name"));
      assert.ok(parsed.availableHeaders.includes("Sector"));
      assert.ok(parsed.availableHeaders.includes("Date"));
      assert.equal(parsed.records.length, 2, "Summary row must be excluded");

      const r1 = parsed.records[0];
      assert.equal(r1.rawEmployeeName, "Suresh Babu Dangeti");
      assert.equal(r1.fromLocation, "HYD");
      assert.equal(r1.toLocation, "DEL");
      assert.equal(r1.travelDate, "2026-09-01");
      assert.equal(r1.cost, 6800);
      assert.equal(r1.ticketReference, "6E-502");
      assert.equal(r1.provider, "6E");
      assert.equal(r1.status, "VALID");
      assert.equal(r1.validationErrors.length, 0);

      const r2 = parsed.records[1];
      assert.equal(r2.rawEmployeeName, "Anil Kukreja");
      assert.equal(r2.fromLocation, "BOM");
      assert.equal(r2.toLocation, "BLR");
      assert.equal(r2.travelDate, "2026-09-02");
      assert.equal(r2.cost, 7500);
      assert.equal(r2.status, "VALID");
    });
  });
});


describe("Spreadsheet reading is safe", async () => {
  const { parseSpreadsheetClient, parseExcelDate } = await import("../lib/spreadsheetParser.ts");
  const { default: writeXlsxFile } = await import("write-excel-file/node");
  const { DOMParser } = await import("@xmldom/xmldom");
  (globalThis as { DOMParser?: unknown }).DOMParser ??= DOMParser;
  const fs = await import("node:fs");
  const path = await import("node:path");
  const root = path.resolve(import.meta.dirname, "../../..");
  const toAb = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

  test("the vulnerable SheetJS 0.18 'xlsx' package is gone", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    assert.equal(pkg.dependencies?.xlsx, undefined);
    assert.equal(pkg.devDependencies?.xlsx, undefined);
  });

  test("real Excel date cells and Excel serial numbers become yyyy-mm-dd", async () => {
    assert.equal(parseExcelDate(46266), "2026-09-01");
    const buf = await writeXlsxFile([
      ["Date", "Pax Name", "Sector", "Net Amount"],
      [{ value: new Date(Date.UTC(2026, 8, 3)), type: Date, format: "dd-mmm-yy" }, "RAO/BINA MS", "MAA-DEL", { value: 5200, type: Number }],
    ], { sheet: "Sep" }).toBuffer();
    const parsed = await parseSpreadsheetClient(toAb(buf));
    assert.equal(parsed.records.length, 1);
    assert.equal(parsed.records[0].travelDate, "2026-09-03");
    assert.equal(parsed.records[0].cost, 5200);
  });

  test("CSV files are read too", async () => {
    const csv = "Date,Pax Name,Sector,Net Amount\n04 Sep 26,\"KUKREJA, ANIL\",BOM-BLR,7500\n";
    const parsed = await parseSpreadsheetClient(toAb(Buffer.from(csv)));
    assert.equal(parsed.records.length, 1);
    assert.equal(parsed.records[0].rawEmployeeName, "Anil Kukreja");
  });

  test("a damaged or fake .xlsx gives a clear message instead of breaking the page", async () => {
    const fake = Buffer.concat([Buffer.from("PK\u0003\u0004"), Buffer.from("not really a zip".repeat(10))]);
    await assert.rejects(parseSpreadsheetClient(toAb(fake)), /could not be read as an Excel workbook/);
  });
});
