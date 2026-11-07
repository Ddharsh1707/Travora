import type { CellValue } from "./importParser";
import { fieldForHeader, type SheetInput } from "./workbook";

/**
 * Reads the tables in a text PDF (a travel agent statement, a bulk booking
 * list, an export of past employee records) into the same rows a spreadsheet
 * gives. The upload then runs the exact same checks as for Excel.
 *
 * How: each word on a page has a position. Words on the same line become a
 * row. The header line (the one with the most known headings such as
 * "Passenger Name", "Date", "PNR", "Amount") gives the columns, and every
 * other word goes into the column it sits under. Pages that repeat the same
 * header continue the same table.
 *
 * Scanned PDFs (pictures of paper) have no words to read and are reported.
 */

export type PdfWord = { str: string; x: number; y: number; w: number; h: number };
type Chunk = { text: string; x0: number; x1: number };
type Line = { y: number; chunks: Chunk[] };

const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

/** Words on the same baseline, left to right, with nearby words joined. */
export function wordsToLines(words: PdfWord[]): Line[] {
  const items = words.filter((w) => clean(w.str)).sort((a, b) => b.y - a.y || a.x - b.x);
  if (!items.length) return [];
  const heights = items.map((w) => w.h || 8).sort((a, b) => a - b);
  const tol = Math.max(2, heights[Math.floor(heights.length / 2)] * 0.45);
  const lines: Array<{ y: number; words: PdfWord[] }> = [];
  for (const w of items) {
    const line = lines.find((l) => Math.abs(l.y - w.y) <= tol);
    if (line) line.words.push(w);
    else lines.push({ y: w.y, words: [w] });
  }
  lines.sort((a, b) => b.y - a.y);
  return lines.map((l) => {
    const ws = l.words.sort((a, b) => a.x - b.x);
    const chunks: Chunk[] = [];
    for (const w of ws) {
      const last = chunks[chunks.length - 1];
      const charW = (w.w || w.h * 0.5) / Math.max(1, w.str.length);
      // A gap of about two characters or more starts a new cell.
      if (last && w.x - last.x1 < Math.max(3, charW * 1.6)) {
        last.text = clean(`${last.text}${w.x - last.x1 > charW * 0.25 ? " " : ""}${w.str}`);
        last.x1 = Math.max(last.x1, w.x + w.w);
      } else {
        chunks.push({ text: clean(w.str), x0: w.x, x1: w.x + w.w });
      }
    }
    return { y: l.y, chunks: chunks.filter((c) => c.text) };
  });
}

const headerScore = (l: Line) => l.chunks.filter((c) => fieldForHeader(c.text)).length;

function findHeader(lines: Line[]): number {
  let best = -1;
  let score = 2; // at least three known headings
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const s = headerScore(lines[i]);
    if (s > score) { score = s; best = i; }
  }
  return best;
}

type Columns = Array<{ x0: number; x1: number; title: string }>;

/** Which column a cell belongs to: the one it overlaps most, else the nearest. */
function columnFor(cols: Columns, c: Chunk): number {
  let best = 0;
  let bestOverlap = -1;
  let bestDist = Infinity;
  cols.forEach((col, i) => {
    const overlap = Math.min(col.x1, c.x1) - Math.max(col.x0, c.x0);
    const dist = Math.abs((col.x0 + col.x1) / 2 - (c.x0 + c.x1) / 2);
    if (overlap > 0 ? overlap > bestOverlap : bestOverlap <= 0 && dist < bestDist) {
      if (overlap > 0) bestOverlap = overlap;
      best = i;
      bestDist = dist;
    }
  });
  return best;
}

function lineToRow(cols: Columns, l: Line): CellValue[] {
  const row: string[] = cols.map(() => "");
  for (const c of l.chunks) {
    const i = columnFor(cols, c);
    row[i] = row[i] ? `${row[i]} ${c.text}` : c.text;
  }
  return row.map((v) => (v === "" ? null : v));
}

const headerKey = (cols: Columns) => cols.map((c) => c.title.toUpperCase()).join("|");

/** Pages of words to sheets. Pure, so it is tested without a PDF. */
export function pagesToSheets(pages: PdfWord[][], baseName = "PDF"): SheetInput[] {
  const sheets: Array<SheetInput & { key: string; cols: Columns }> = [];
  let current: (SheetInput & { key: string; cols: Columns }) | null = null;

  pages.forEach((words, p) => {
    const lines = wordsToLines(words);
    if (!lines.length) return;
    const hi = findHeader(lines);
    if (hi >= 0) {
      const cols: Columns = lines[hi].chunks.map((c) => ({ x0: c.x0, x1: c.x1, title: c.text }));
      const key = headerKey(cols);
      const body = lines.slice(hi + 1);
      if (current && current.key === key) {
        // The same table continues: the repeated header is dropped.
        for (const l of body) current.rows.push(lineToRow(cols, l));
      } else {
        const titles = lines.slice(0, hi).map((l) => [l.chunks.map((c) => c.text).join(" ")] as CellValue[]);
        current = { name: `${baseName} page ${p + 1}`, rows: [...titles, cols.map((c) => c.title), ...body.map((l) => lineToRow(cols, l))], merges: [], key, cols };
        sheets.push(current);
      }
    } else if (current) {
      // No header on this page: the table from the previous page goes on.
      for (const l of lines) current.rows.push(lineToRow(current.cols, l));
    } else {
      sheets.push({ name: `${baseName} page ${p + 1}`, rows: lines.map((l) => l.chunks.map((c) => c.text)), merges: [], key: "", cols: [] });
    }
  });

  return sheets.map((s) => ({ name: s.name.slice(0, 120), rows: mergeWrappedLines(s.rows, s.cols.length), merges: [] }));
}

/**
 * A long name or place that wraps onto a second line leaves a line with just
 * one or two cells and nothing in the first columns. That text belongs to the
 * row above.
 */
function mergeWrappedLines(rows: CellValue[][], width: number): CellValue[][] {
  if (width < 4) return rows;
  const out: CellValue[][] = [];
  let headerSeen = false;
  for (const row of rows) {
    const filled = row.filter((c) => c !== null && c !== "").length;
    const prev = out[out.length - 1];
    const lead = row.slice(0, 2).some((c) => c !== null && c !== "");
    const isHeader = row.filter((c) => typeof c === "string" && fieldForHeader(c)).length >= 3;
    if (isHeader) headerSeen = true;
    if (headerSeen && !isHeader && prev && prev.length === row.length && !lead && filled > 0 && filled <= Math.max(1, Math.floor(width / 4))
        && prev.filter((c) => c !== null && c !== "").length >= width / 2) {
      row.forEach((c, i) => { if (c) prev[i] = prev[i] ? `${prev[i]} ${c}` : c; });
      continue;
    }
    out.push(row);
  }
  return out;
}

/** Opens a PDF in the browser (no upload yet) and returns its tables. */
export async function readPdfTables(file: File): Promise<SheetInput[]> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), disableFontFace: true });
  const doc = await task.promise;
  if (doc.numPages > 200) throw new Error("The PDF has more than 200 pages. Split it into smaller files.");
  const pages: PdfWord[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const words: PdfWord[] = [];
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const [, , , d, e, f] = it.transform as number[];
      words.push({ str: it.str, x: e, y: f, w: it.width, h: Math.abs(d) || it.height || 8 });
    }
    pages.push(words);
    page.cleanup();
  }
  await task.destroy();
  if (!pages.some((p) => p.length)) {
    throw new Error("This PDF has no readable text (it is probably a scan). Export it from the source system as PDF or Excel, or type the rows into the Excel template.");
  }
  const base = file.name.replace(/\.pdf$/i, "").slice(0, 60) || "PDF";
  return pagesToSheets(pages, base);
}
