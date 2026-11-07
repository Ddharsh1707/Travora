import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Paperclip, Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  CATEGORY_LABELS, EXPENSE_CATEGORIES, PAYMENT_LABELS, PAYMENT_METHODS,
  createExpense, listExpenses, listProjectChoices, summarizeExpenses, updateExpense, withdrawExpense,
  type Expense, type ExpenseStatus, type ProjectChoice,
} from "../../lib/data/expenses";
import { getDocumentUrl, uploadDocument } from "../../lib/data/documents";
import { useLiveRefresh } from "../../lib/data/reports";
import { exportToCsv } from "../../utils/exportCsv";
import { Empty, ErrorNotice, Loading, PageHeader, Stat, formatDate, formatMoney } from "./common";
import { ExpenseStatusPill } from "./ExpenseStatusPill";
import ExpenseUploadDialog from "./ExpenseUploadDialog";

const today = () => new Date().toISOString().slice(0, 10);
const BLANK = { expense_date: "", category: "meals", description: "", amount: "", payment_method: "personal", project_id: "", origin: "", destination: "" };

/** An employee's own expense claims: add, edit while submitted, withdraw, track. */
export default function MyExpenses({ profileId }: { profileId: string }) {
  const [rows, setRows] = useState<Expense[]>([]);
  const [status, setStatus] = useState<ExpenseStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const [uploading, setUploading] = useState(false);
  const [projects, setProjects] = useState<ProjectChoice[]>([]);
  useEffect(() => { void listProjectChoices().then(setProjects); }, []);
  const projectName = (id?: string | null) => (id ? projects.find((p) => p.id === id)?.name : undefined);

  const load = useCallback(async () => {
    setError("");
    try {
      setRows(await listExpenses({ employeeId: profileId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your expenses.");
    } finally {
      setLoading(false);
    }
  }, [profileId]);
  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(["expenses"], load);

  const totals = useMemo(() => summarizeExpenses(rows), [rows]);
  const shown = status ? rows.filter((r) => r.status === status) : rows.filter((r) => r.status !== "withdrawn");

  async function withdraw(id: string) {
    if (!window.confirm("Withdraw this expense claim?")) return;
    try {
      await withdrawExpense(id);
      toast.success("Expense withdrawn");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not withdraw the expense.");
    }
  }

  async function openReceipt(e: Expense, which: "receipt" | "upload" = "receipt") {
    const doc = which === "upload" ? e.upload : e.receipt;
    if (!doc) return;
    try {
      window.open(await getDocumentUrl(doc), "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The receipt could not be opened.");
    }
  }

  function exportCsv() {
    exportToCsv("my_expenses", ["Date", "Category", "Description", "Project", "From", "To", "Amount", "Paid by", "Status", "Reviewer note"],
      shown.map((e) => [e.expense_date, CATEGORY_LABELS[e.category], e.description, projectName(e.project_id) ?? "", e.origin, e.destination, e.amount, PAYMENT_LABELS[e.payment_method], e.status, e.review_note]));
  }

  return (
    <div className="page-stack animate-page">
      <PageHeader
        eyebrow="EXPENSES"
        title="My expenses"
        description="Claim money you spent for work, one at a time or from an Excel sheet. The Admin or CEO reviews each claim; you can edit or withdraw it until then."
        actions={<>
          <button type="button" className="button button-ghost" onClick={exportCsv} disabled={!shown.length}><Download size={15} /> Export</button>
          <button type="button" className="button button-ghost" onClick={() => setUploading(true)}><FileSpreadsheet size={15} /> Upload from Excel</button>
          <button type="button" className="button button-primary" onClick={() => setEditing("new")}><Plus size={16} /> New expense</button>
        </>}
      />
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="Waiting for review" value={formatMoney(totals.submitted)} detail={`${totals.submittedCount} claim(s)`} />
        <Stat label="Approved, to be paid" value={formatMoney(totals.approved)} />
        <Stat label="Reimbursed" value={formatMoney(totals.reimbursed)} />
        <Stat label="Rejected" value={formatMoney(totals.rejected)} />
      </div>

      <div className="panel p-3 flex flex-wrap gap-2 items-center">
        <span className="text-xs opacity-70">Show</span>
        {(["", "submitted", "approved", "reimbursed", "rejected", "withdrawn"] as const).map((s) => (
          <button key={s || "all"} type="button" className={`button ${status === s ? "button-primary" : "button-ghost"}`} onClick={() => setStatus(s)}>
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : "All"}
          </button>
        ))}
      </div>

      {error && <ErrorNotice message={error} onRetry={load} />}
      <div className="panel table-panel">
        {loading ? <Loading /> : shown.length === 0 ? <Empty title="No expenses here" description="Use “New expense” to claim a cab, meal, hotel or anything else you paid for." /> : (
          <div className="responsive-table">
            <table>
              <thead><tr><th>Date</th><th>What for</th><th className="text-right">Amount</th><th>Status</th><th>Reviewer note</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDate(e.expense_date)}</td>
                    <td className="max-w-[280px]">
                      <div className="truncate font-semibold" title={e.description}>{e.description}</div>
                      <div className="table-subline">{CATEGORY_LABELS[e.category]} · {PAYMENT_LABELS[e.payment_method]}
                        {(e.origin || e.destination) && <> · {[e.origin, e.destination].filter(Boolean).join(" to ")}</>}
                        {projectName(e.project_id) && <> · {projectName(e.project_id)}</>}
                        {e.receipt && <> · <button type="button" className="underline" onClick={() => openReceipt(e)}><Paperclip size={11} className="inline" /> receipt</button></>}
                        {e.upload && <> · <button type="button" className="underline" onClick={() => openReceipt(e, "upload")}><FileSpreadsheet size={11} className="inline" /> from {e.upload.original_filename}</button></>}
                      </div>
                    </td>
                    <td className="text-right font-semibold">{formatMoney(e.amount, e.currency)}</td>
                    <td><ExpenseStatusPill status={e.status} /></td>
                    <td className="max-w-[200px] truncate" title={e.review_note ?? ""}>{e.review_note ?? "—"}</td>
                    <td className="whitespace-nowrap"><div className="flex flex-wrap items-center gap-3">
                      {e.status === "submitted" && <>
                        <button type="button" className="table-action" onClick={() => setEditing(e)}>Edit</button>
                        <button type="button" className="table-action table-action-danger" onClick={() => withdraw(e.id)}>Withdraw</button>
                      </>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <ExpenseDialog
          profileId={profileId}
          expense={editing === "new" ? null : editing}
          projects={projects}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
      {uploading && (
        <ExpenseUploadDialog
          profileId={profileId}
          projects={projects}
          existing={rows}
          onClose={() => setUploading(false)}
          onSaved={() => { setUploading(false); void load(); }}
        />
      )}
    </div>
  );
}

function ExpenseDialog({ profileId, expense, projects, onClose, onSaved }: { profileId: string; expense: Expense | null; projects: ProjectChoice[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Record<string, string>>(() => expense ? {
    expense_date: expense.expense_date,
    category: expense.category,
    description: expense.description,
    amount: String(expense.amount),
    payment_method: expense.payment_method,
    project_id: expense.project_id ?? "",
    origin: expense.origin ?? "",
    destination: expense.destination ?? "",
  } : { ...BLANK, expense_date: today() });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setError("");
    try {
      let receiptId = expense?.receipt_document_id ?? null;
      if (file) receiptId = (await uploadDocument(profileId, file, "invoice")).id;
      const payload = { ...form, project_id: form.project_id || null, receipt_document_id: receiptId } as never;
      if (expense) await updateExpense(expense.id, payload);
      else await createExpense(profileId, payload);
      toast.success(expense ? "Expense updated" : "Expense sent for review");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the expense.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="expense-title">
      <form className="confirm-dialog max-w-xl w-full text-left max-h-[90vh] overflow-y-auto" onSubmit={submit}>
        <button type="button" className="icon-button dialog-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <span className="card-kicker">EXPENSE CLAIM</span>
        <h2 id="expense-title">{expense ? "Edit expense" : "New expense"}</h2>
        <div className="grid gap-3 sm:grid-cols-2 mt-4">
          <label className="field"><span>Date</span><input type="date" value={form.expense_date} onChange={set("expense_date")} max={today()} required /></label>
          <label className="field"><span>Amount (₹)</span><input type="number" min="1" step="0.01" inputMode="decimal" value={form.amount} onChange={set("amount")} required /></label>
          <label className="field"><span>Category</span>
            <select value={form.category} onChange={set("category")}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </label>
          <label className="field"><span>Paid with</span>
            <select value={form.payment_method} onChange={set("payment_method")}>
              {PAYMENT_METHODS.map((p) => <option key={p} value={p}>{PAYMENT_LABELS[p]}</option>)}
            </select>
          </label>
          <label className="field"><span>From (optional)</span><input value={form.origin} onChange={set("origin")} maxLength={120} placeholder="e.g. Hyderabad airport" /></label>
          <label className="field"><span>To (optional)</span><input value={form.destination} onChange={set("destination")} maxLength={120} placeholder="e.g. Site office" /></label>
          {projects.length > 0 && (
            <label className="field sm:col-span-2"><span>Project (optional)</span>
              <select value={form.project_id} onChange={set("project_id")}>
                <option value="">No project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ""}</option>)}
              </select>
            </label>
          )}
          <label className="field sm:col-span-2"><span>What was it for?</span><textarea value={form.description} onChange={set("description")} required maxLength={500} rows={2} placeholder="e.g. Cab from airport to client office" /></label>
          <label className="field sm:col-span-2"><span>Receipt (PDF or photo, optional)</span>
            <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {expense?.receipt && !file && <span className="text-xs opacity-70">Current: {expense.receipt.original_filename}</span>}
          </label>
        </div>
        {error && <p className="text-sm text-red-600 mt-3" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={saving}>{saving ? "Saving…" : expense ? "Save changes" : "Submit expense"}</button>
        </div>
      </form>
    </div>
  );
}
