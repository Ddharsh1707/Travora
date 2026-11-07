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

export async function exportToXlsx(filename: string, sheetName: string, headers: string[], rows: Cell[][]): Promise<void> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows.map((r) => r.map(safeCell))]);
  ws["!cols"] = headers.map((h) => ({ wch: Math.min(Math.max(h.length + 2, 12), 40) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1");
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
