import { sheetName } from "../lib/reportDoc";

/**
 * Downloads rows as a real Excel (.xlsx) file. Text that starts with a
 * formula character is prefixed with ' so Excel shows it as text
 * (CSV/Excel formula injection, CWE-1236). Numbers stay numbers.
 */
type Cell = string | number | boolean | null | undefined;

export function safeCell(v: Cell): string | number | boolean {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" || typeof v === "boolean") return v;
  const s = String(v);
  return /^[=+\-@\t\r]/.test(s.trimStart()) ? `'${s}` : s;
}

export type XlsxSheet = { name: string; headers: string[]; rows: Cell[][] };

/** One .xlsx file with several sheets (tabs). */
export async function exportWorkbook(filename: string, sheets: XlsxSheet[]): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const used = new Set<string>();
  await writeXlsxFile(sheets.map((s) => ({
    sheet: sheetName(s.name, used),
    data: [s.headers.map((h) => ({ value: h, fontWeight: "bold" as const })), ...s.rows.map((r) => r.map(safeCell))],
    columns: s.headers.map((h) => ({ width: Math.min(Math.max(h.length + 2, 12), 40) })),
    stickyRowsCount: 1,
  }))).toFile(`${filename.replace(/[^\w.-]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportToXlsx(filename: string, sheetName: string, headers: string[], rows: Cell[][]): Promise<void> {
  await exportWorkbook(filename, [{ name: sheetName, headers, rows }]);
}
