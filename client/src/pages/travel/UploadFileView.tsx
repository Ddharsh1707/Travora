import { useEffect, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { downloadImportFile, getWorkbookRows, type ImportBatch, type WorkbookRow } from "../../lib/data/imports";
import { kindFromName, readUploadFile } from "../../lib/data/readUploadFile";
import type { SheetInput } from "../../lib/data/workbook";
import { Loading } from "./common";
import { WorkbookViewer, type RowLink } from "./WorkbookViewer";

const letterIndex = (l: string) => l.split("").reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);

/** When the original file was not kept: rebuild each sheet from the rows the upload saved. */
export function sheetsFromRows(batch: Pick<ImportBatch, "sheets">, rows: WorkbookRow[]): SheetInput[] {
  const order = new Map<string, string[]>();
  for (const s of (Array.isArray(batch.sheets) ? batch.sheets : []) as Array<{ name: string; mapped?: Array<{ column: string; header: string }>; unmapped?: Array<{ column: string; header: string }> }>) {
    const cols = [...(s.mapped ?? []), ...(s.unmapped ?? [])].sort((a, b) => letterIndex(a.column) - letterIndex(b.column));
    order.set(s.name, Array.from(new Set(cols.map((c) => c.header))));
  }
  const bySheet = new Map<string, WorkbookRow[]>();
  for (const r of rows) {
    const k = r.sheet_name ?? "Sheet";
    bySheet.set(k, [...(bySheet.get(k) ?? []), r]);
  }
  return Array.from(bySheet.entries()).map(([name, rs]) => {
    const raw = (r: WorkbookRow) => ((r as unknown as { raw?: Record<string, string> }).raw ?? {});
    const headers = [...(order.get(name) ?? [])];
    for (const r of rs) for (const h of Object.keys(raw(r))) if (!headers.includes(h)) headers.push(h);
    const sorted = [...rs].sort((a, b) => (a.source_row ?? 0) - (b.source_row ?? 0));
    return { name, merges: [], rows: [headers, ...sorted.map((r) => headers.map((h) => raw(r)[h] ?? null))] };
  });
}

/** The uploaded file, shown like the workbook it came from, with each row linked to its employee. */
export function UploadFileView({ batch }: { batch: ImportBatch & { file_path?: string | null } }) {
  const [sheets, setSheets] = useState<SheetInput[] | null>(null);
  const [links, setLinks] = useState<Record<string, RowLink>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await getWorkbookRows(batch.id).catch(() => [] as WorkbookRow[]);
        const l: Record<string, RowLink> = {};
        for (const r of rows) {
          if (r.sheet_name && r.source_row && r.profile_id) {
            l[`${r.sheet_name}|${r.source_row}`] = { id: r.profile_id, name: r.profile?.full_name ?? r.employee_name ?? "Employee", status: r.status };
          }
        }
        let s: SheetInput[];
        if (batch.file_path) {
          const file = await downloadImportFile(batch.file_path, batch.original_filename);
          s = await readUploadFile(file, kindFromName(batch.original_filename));
          setNote(batch.original_filename.toLowerCase().endsWith(".pdf") ? "Tables read from the PDF." : "The original file, exactly as uploaded.");
        } else {
          s = sheetsFromRows(batch, rows);
          setNote("The original file was not kept, so this is rebuilt from the saved rows.");
        }
        if (!alive) return;
        // Row links only fit when the grid has the file's own row numbers.
        setLinks(batch.file_path ? l : {});
        setSheets(s);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "The file could not be shown.");
      }
    })();
    return () => { alive = false; };
  }, [batch]);

  return (
    <section className="panel p-4 grid gap-3 min-w-0">
      <div className="flex items-center gap-2"><FileSpreadsheet size={16} /><h2 className="section-heading m-0">The file as uploaded</h2></div>
      {error ? <p className="text-sm text-red-600">{error}</p> : !sheets ? <Loading label="Opening the file…" /> : <WorkbookViewer sheets={sheets} links={links} note={note} />}
    </section>
  );
}
