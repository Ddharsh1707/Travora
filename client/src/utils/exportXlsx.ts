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
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet([s.headers, ...s.rows.map((r) => r.map(safeCell))]);
    ws["!cols"] = s.headers.map((h) => ({ wch: Math.min(Math.max(h.length + 2, 12), 40) }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1");
  }
  XLSX.writeFile(wb, `${filename.replace(/[^\w.-]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportToXlsx(filename: string, sheetName: string, headers: string[], rows: Cell[][]): Promise<void> {
  await exportWorkbook(filename, [{ name: sheetName, headers, rows }]);
}
