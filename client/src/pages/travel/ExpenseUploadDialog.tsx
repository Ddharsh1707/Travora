import { useState } from "react";
import { Download, FileSpreadsheet, X } from "lucide-react";
import { toast } from "sonner";
import { checkImportFile, type CellValue } from "../../lib/data/importParser";
import { CATEGORY_LABELS, createExpensesFromUpload, type Expense, type ProjectChoice } from "../../lib/data/expenses";
import { EXPENSE_FIELD_LABELS, EXPENSE_TEMPLATE_HEADERS, EXPENSE_TEMPLATE_ROWS, MAX_EXPENSE_ROWS, parseExpenseSheet, type ExpenseLine } from "../../lib/data/expenseUpload";
import { uploadSpreadsheetDocument } from "../../lib/data/documents";
import { exportToCsv } from "../../utils/exportCsv";
import { formatDate, formatMoney } from "./common";

async function readSheets(file: File, kind: "csv" | "xlsx"): Promise<Array<{ name: string; rows: CellValue[][] }>> {
  if (kind === "csv") {
    const Papa = (await import("papaparse")).default;
    const result = Papa.parse<string[]>(await file.text(), { skipEmptyLines: false });
    return [{ name: file.name, rows: result.data as CellValue[][] }];
  }
  const { default: readXlsxFile, readSheetNames } = await import("read-excel-file");
  const names = (await readSheetNames(file)).slice(0, 20);
  const out: Array<{ name: string; rows: CellValue[][] }> = [];
  for (const name of names) out.push({ name, rows: (await readXlsxFile(file, { sheet: name })) as CellValue[][] });
  return out;
}

const TONE: Record<ExpenseLine["status"], string> = { ok: "approved", error: "rejected", duplicate: "cancelled" };
const LABEL: Record<ExpenseLine["status"], string> = { ok: "Ready", error: "Fix in the sheet", duplicate: "Already claimed" };

/**
 * Employee: upload an Excel/CSV of their own expenses. Nothing is saved until
 * they confirm. The original sheet is kept with the claims.
 */
export default function ExpenseUploadDialog({ profileId, projects, existing, onClose, onSaved }: {
  profileId: string; projects: ProjectChoice[]; existing: Expense[]; onClose: () => void; onSaved: () => void;
}) {
  const [file, setFile] = useState<{ blob: File; kind: "csv" | "xlsx"; sheet: string } | null>(null);
  const [lines, setLines] = useState<ExpenseLine[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setError("");
    setLines([]);
    const check = checkImportFile(f.name, f.size, new Uint8Array(await f.slice(0, 8).arrayBuffer()));
    if (!check.ok) { setError(check.error); return; }
    setBusy(true);
    try {
      const sheets = await readSheets(f, check.kind);
      let found: ReturnType<typeof parseExpenseSheet> | null = null;
      let sheetName = "";
      for (const s of sheets) {
        const parsed = parseExpenseSheet(s.rows, { projects, existing });
        if (!parsed.error && parsed.lines.length) { found = parsed; sheetName = s.name; break; }
        if (!found && !parsed.error) { found = parsed; sheetName = s.name; }
      }
      if (!found) { setError("Could not find a Date column and an Amount column in any sheet. Download the template to see the layout."); return; }
      if (found.lines.length === 0) { setError("The sheet has a header but no expense rows."); return; }
      if (found.lines.length > MAX_EXPENSE_ROWS) { setError(`The sheet has more than ${MAX_EXPENSE_ROWS} rows. Split it into smaller files.`); return; }
      setFile({ blob: f, kind: check.kind, sheet: sheetName });
      setLines(found.lines);
      setColumns(Object.values(found.columns).map((c) => EXPENSE_FIELD_LABELS[c]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the file.");
    } finally {
      setBusy(false);
    }
  }

  const ready = lines.filter((l) => l.status === "ok");
  const total = ready.reduce((t, l) => t + (l.amount ?? 0), 0);

  async function save() {
    if (!file || !ready.length) return;
    setBusy(true);
    setError("");
    try {
      const doc = await uploadSpreadsheetDocument(profileId, file.blob, file.kind);
      const n = await createExpensesFromUpload(profileId, doc.id, ready.map((l) => ({
        expense_date: l.expense_date, category: l.category, description: l.description, amount: l.amount ?? 0,
        payment_method: l.payment_method, project_id: l.project_id, origin: l.origin || null, destination: l.destination || null,
      })));
      toast.success(`${n} expense(s) sent for review`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the expenses.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="upload-title">
      <div className="confirm-dialog max-w-4xl w-full text-left max-h-[90vh] overflow-y-auto">
        <button type="button" className="icon-button dialog-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <span className="card-kicker">UPLOAD EXPENSES</span>
        <h2 id="upload-title">Upload your expenses from Excel</h2>
        <p className="text-sm opacity-80 mt-2">
          Use a .xlsx or .csv file with a <strong>Date</strong> and an <strong>Amount</strong> column. Category, Description, Paid by,
          Project, From and To are read too when present. You'll see every row before anything is saved.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <label className="button button-primary cursor-pointer">
            <FileSpreadsheet size={15} /> {file ? "Choose another file" : "Choose file"}
            <input type="file" accept=".xlsx,.csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} disabled={busy} />
          </label>
          <button type="button" className="button button-ghost" onClick={() => exportToCsv("expense_template", EXPENSE_TEMPLATE_HEADERS, EXPENSE_TEMPLATE_ROWS)}>
            <Download size={15} /> Download template
          </button>
        </div>
        {busy && !lines.length && <p className="text-sm mt-3">Reading the file…</p>}
        {error && <p className="text-sm text-red-600 mt-3" role="alert">{error}</p>}

        {file && lines.length > 0 && (
          <>
            <p className="text-sm mt-4">
              <strong>{file.blob.name}</strong>{file.sheet !== file.blob.name ? ` · sheet "${file.sheet}"` : ""} · columns found: {columns.join(", ")}
            </p>
            <div className="flex flex-wrap gap-2 mt-2 text-sm">
              <span className="status-badge status-approved"><span className="status-dot" />{ready.length} ready · {formatMoney(total)}</span>
              <span className="status-badge status-rejected"><span className="status-dot" />{lines.filter((l) => l.status === "error").length} to fix</span>
              <span className="status-badge status-cancelled"><span className="status-dot" />{lines.filter((l) => l.status === "duplicate").length} already claimed</span>
            </div>
            <div className="responsive-table mt-3">
              <table>
                <thead><tr><th>Row</th><th>Date</th><th>What for</th><th className="text-right">Amount</th><th>Check</th></tr></thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.row}>
                      <td>{l.row}</td>
                      <td>{l.expense_date && /^\d{4}-\d{2}-\d{2}$/.test(l.expense_date) ? formatDate(l.expense_date) : l.expense_date || "—"}</td>
                      <td className="max-w-[280px]">
                        <div className="truncate font-semibold" title={l.description}>{l.description || "—"}</div>
                        <div className="table-subline">{CATEGORY_LABELS[l.category]}{l.origin || l.destination ? ` · ${[l.origin, l.destination].filter(Boolean).join(" to ")}` : ""}{l.project_id ? ` · ${projects.find((p) => p.id === l.project_id)?.name}` : ""}</div>
                      </td>
                      <td className="text-right">{l.amount === null ? "—" : formatMoney(l.amount, l.currency)}</td>
                      <td>
                        <span className={`status-badge status-${TONE[l.status]}`}><span className="status-dot" />{LABEL[l.status]}</span>
                        {l.problems.length > 0 && <div className="table-subline">{l.problems.join(". ")}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="dialog-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="button button-primary" onClick={save} disabled={busy || !ready.length}>
            {busy && lines.length ? "Saving…" : `Submit ${ready.length || ""} expense(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
