import type { CellValue } from "./importParser";
import { readMerges } from "./xlsxMerges";
import type { SheetInput } from "./workbook";

export type UploadKind = "csv" | "xlsx" | "pdf";

/** Reads every sheet of an Excel or CSV file, or every table of a text PDF, in the browser. */
export async function readUploadFile(file: File, kind: UploadKind): Promise<SheetInput[]> {
  if (kind === "pdf") {
    const { readPdfTables } = await import("./pdfTables");
    return readPdfTables(file);
  }
  if (kind === "csv") {
    const Papa = (await import("papaparse")).default;
    const result = Papa.parse<string[]>(await file.text(), { skipEmptyLines: false });
    return [{ name: file.name.replace(/\.csv$/i, ""), rows: result.data as CellValue[][], merges: [] }];
  }
  const { default: readXlsxFile, readSheetNames } = await import("read-excel-file");
  const merges = readMerges(new Uint8Array(await file.arrayBuffer()));
  const names = await readSheetNames(file);
  if (names.length > 40) throw new Error("The workbook has more than 40 sheets. Split it into smaller files.");
  const sheets: SheetInput[] = [];
  for (const name of names) {
    const rows = (await readXlsxFile(file, { sheet: name })) as CellValue[][];
    sheets.push({ name, rows, merges: merges[name] ?? [] });
  }
  return sheets;
}

export function kindFromName(name: string): UploadKind {
  const n = name.toLowerCase();
  return n.endsWith(".pdf") ? "pdf" : n.endsWith(".csv") ? "csv" : "xlsx";
}
