import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Download, Paperclip, Search, Wallet, X } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { CATEGORY_LABELS, EXPENSE_CATEGORIES, PAYMENT_LABELS, decideExpense, listExpenses, summarizeExpenses, type Expense, type ExpenseStatus } from "../../lib/data/expenses";
import { getDocumentUrl } from "../../lib/data/documents";
import { useLiveRefresh } from "../../lib/data/reports";
import { exportToCsv } from "../../utils/exportCsv";
import { Empty, ErrorNotice, Loading, PageHeader, Stat, formatDate, formatMoney } from "./common";
import { ExpenseStatusPill } from "./ExpenseStatusPill";
import AllSpend from "./AllSpend";
import ModalPortal from "../../components/ModalPortal";

type Decision = "approved" | "rejected" | "reimbursed";

/**
 * Director and Travel Desk: two views.
 *  - "Claims to review": employee expense claims with approve / reject / reimburse.
 *  - "All spend": claims plus every travel desk trip and Excel upload in one list.
 */
export default function AllExpenses({ profileId, isCeo = true }: { profileId: string; isCeo?: boolean }) {
  const [tab, setTab] = useState<"claims" | "all">("claims");
  return (
    <div className="page-stack animate-page">
      <PageHeader
        eyebrow="Director & Travel Desk"
        title="All expenses"
        description="Employee claims and travel desk uploads in one place. Review claims, or see every rupee with filters and export."
      />
      <div className="panel p-2 flex flex-wrap gap-2" role="tablist" aria-label="Expense views">
        <button type="button" role="tab" aria-selected={tab === "claims"} className={`button ${tab === "claims" ? "button-primary" : "button-ghost"}`} onClick={() => setTab("claims")}>Claims to review</button>
        <button type="button" role="tab" aria-selected={tab === "all"} className={`button ${tab === "all" ? "button-primary" : "button-ghost"}`} onClick={() => setTab("all")}>All spend (claims + Excel uploads)</button>
      </div>
      {tab === "claims" ? <ClaimsReview profileId={profileId} isCeo={isCeo} /> : <AllSpend />}
    </div>
  );
}

function ClaimsReview({ profileId, isCeo }: { profileId: string; isCeo: boolean }) {
  const [rows, setRows] = useState<Expense[]>([]);
  const [status, setStatus] = useState<ExpenseStatus | "">("submitted");
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<Expense | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      setRows(await listExpenses({ status, from, to, limit: 1000 }));
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load expenses.");
    } finally {
      setLoading(false);
    }
  }, [status, from, to]);
  useEffect(() => { setLoading(true); void load(); }, [load]);
  useLiveRefresh(["expenses"], load);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((e) =>
      (!category || e.category === category) &&
      (status !== "" || e.status !== "withdrawn") &&
      (!term || e.description.toLowerCase().includes(term) || (e.employee?.full_name ?? "").toLowerCase().includes(term)
        || (e.employee?.employee_id ?? "").toLowerCase().includes(term) || (e.employee?.department ?? "").toLowerCase().includes(term)));
  }, [rows, q, category, status]);
  const totals = useMemo(() => summarizeExpenses(shown), [shown]);
  const shownTotal = shown.reduce((t, e) => t + Number(e.amount || 0), 0);
  const decidable = shown.filter((e) => e.status === "submitted" && e.employee_id !== profileId);

  async function decide(e: Expense, decision: Decision, note?: string) {
    setBusy(true);
    try {
      await decideExpense(e.id, decision, note);
      toast.success(decision === "approved" ? "Expense approved" : decision === "rejected" ? "Expense rejected" : "Marked as reimbursed");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record the decision.");
    } finally {
      setBusy(false);
    }
  }

  async function approveSelected() {
    const ids = decidable.filter((e) => selected.has(e.id));
    if (!ids.length || !window.confirm(`Approve ${ids.length} claim(s) totalling ${formatMoney(ids.reduce((t, e) => t + Number(e.amount), 0))}?`)) return;
    setBusy(true);
    let done = 0;
    for (const e of ids) {
      try { await decideExpense(e.id, "approved"); done++; } catch { /* reported below */ }
    }
    setBusy(false);
    if (done === ids.length) toast.success(`${done} claim(s) approved`);
    else toast.error(`${done} of ${ids.length} approved. Some could not be approved; please retry.`);
    void load();
  }

  async function openReceipt(e: Expense) {
    if (!e.receipt) return;
    try {
      window.open(await getDocumentUrl(e.receipt), "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The receipt could not be opened.");
    }
  }

  function exportCsv() {
    exportToCsv("company_expenses", ["Date", "Employee", "Employee ID", "Department", "Category", "Description", "Amount", "Paid by", "Status", "Note"],
      shown.map((e) => [e.expense_date, e.employee?.full_name, e.employee?.employee_id, e.employee?.department, CATEGORY_LABELS[e.category],
        e.description, e.amount, PAYMENT_LABELS[e.payment_method], e.status, e.review_note]));
  }

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allSelected = decidable.length > 0 && decidable.every((e) => selected.has(e.id));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm opacity-80 m-0">Approve or reject new claims, then mark approved ones as reimbursed once paid.{isCeo ? " You can also overrule an earlier approval or rejection until it is paid." : ""}</p>
        <button type="button" className="button button-ghost" onClick={exportCsv} disabled={!shown.length}><Download size={15} /> Export CSV</button>
      </div>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="Shown" value={formatMoney(shownTotal)} detail={`${shown.length} claim(s)`} />
        <Stat label="Waiting for you" value={formatMoney(totals.submitted)} detail={`${totals.submittedCount} claim(s)`} />
        <Stat label="Approved, to pay" value={formatMoney(totals.approved)} />
        <Stat label="Reimbursed" value={formatMoney(totals.reimbursed)} />
      </div>

      <div className="panel p-4 flex flex-wrap gap-2 items-end">
        <label className="field min-w-[150px]"><span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as ExpenseStatus | "")}>
            <option value="submitted">Waiting for review</option>
            <option value="approved">Approved (to pay)</option>
            <option value="reimbursed">Reimbursed</option>
            <option value="rejected">Rejected</option>
            <option value="withdrawn">Withdrawn</option>
            <option value="">All</option>
          </select>
        </label>
        <label className="field min-w-[150px]"><span>Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </label>
        <label className="field"><span>From</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="field"><span>To</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <div className="search-field flex-1 min-w-[200px] max-w-none"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Employee, department or description" aria-label="Search expenses" maxLength={80} /></div>
        {selected.size > 0 && <button type="button" className="button button-primary" disabled={busy} onClick={approveSelected}><Check size={15} /> Approve {selected.size} selected</button>}
      </div>

      {error && <ErrorNotice message={error} onRetry={load} />}
      <div className="panel table-panel">
        {loading ? <Loading /> : shown.length === 0 ? <Empty title="Nothing here" description={status === "submitted" ? "No claims are waiting for review." : "No expenses match these filters."} /> : (
          <div className="responsive-table">
            <table>
              <thead><tr>
                <th><input type="checkbox" aria-label="Select all waiting claims" checked={allSelected} disabled={!decidable.length}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(decidable.map((e) => e.id)))} /></th>
                <th>Date</th><th>Employee</th><th>What for</th><th className="text-right">Amount</th><th>Status</th><th><span className="sr-only">Actions</span></th>
              </tr></thead>
              <tbody>
                {shown.map((e) => {
                  const own = e.employee_id === profileId;
                  return (
                    <tr key={e.id}>
                      <td>{e.status === "submitted" && !own && <input type="checkbox" aria-label="Select claim" checked={selected.has(e.id)} onChange={() => toggle(e.id)} />}</td>
                      <td>{formatDate(e.expense_date)}</td>
                      <td>
                        <Link href={`/travel/employees/${e.employee_id}`} className="font-semibold hover:underline">{e.employee?.full_name ?? "—"}</Link>
                        <div className="table-subline">{e.employee?.employee_id}{e.employee?.department ? ` · ${e.employee.department}` : ""}</div>
                      </td>
                      <td className="max-w-[260px]">
                        <div className="truncate" title={e.description}>{e.description}</div>
                        <div className="table-subline">{CATEGORY_LABELS[e.category]} · {PAYMENT_LABELS[e.payment_method]}
                          {e.receipt && <> · <button type="button" className="underline" onClick={() => openReceipt(e)}><Paperclip size={11} className="inline" /> receipt</button></>}
                        </div>
                        {(e.origin || e.destination) && <div className="table-subline">{[e.origin, e.destination].filter(Boolean).join(" to ")}</div>}
                        {e.source === "upload" && <div className="table-subline">From the employee's Excel upload</div>}
                        {e.review_note && <div className="table-subline" title={e.review_note}>Note: {e.review_note}</div>}
                        {e.reviewed_by_role && e.status !== "submitted" && <div className="table-subline">Decided by {e.reviewed_by_role === "admin" ? "the Director" : "the Travel Desk"}</div>}
                      </td>
                      <td className="text-right font-semibold">{formatMoney(e.amount, e.currency)}</td>
                      <td><ExpenseStatusPill status={e.status} /></td>
                      <td className="whitespace-nowrap"><div className="flex flex-wrap items-center gap-3">
                        {own ? <span className="text-xs opacity-60">Your own claim</span> : <>
                          {e.status === "submitted" && <>
                            <button type="button" className="table-action" disabled={busy} onClick={() => decide(e, "approved")}><Check size={13} className="inline" /> Approve</button>
                            <button type="button" className="table-action table-action-danger" disabled={busy} onClick={() => setRejecting(e)}><X size={13} className="inline" /> Reject</button>
                          </>}
                          {e.status === "approved" && <button type="button" className="table-action" disabled={busy} onClick={() => decide(e, "reimbursed")}><Wallet size={13} className="inline" /> Mark paid</button>}
                          {isCeo && e.status === "approved" && <button type="button" className="table-action table-action-danger" disabled={busy} onClick={() => setRejecting(e)}>Overrule: reject</button>}
                          {isCeo && e.status === "rejected" && <button type="button" className="table-action" disabled={busy} onClick={() => decide(e, "approved", "Approved on review")}>Overrule: approve</button>}
                        </>}
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rejecting && <RejectDialog expense={rejecting} onClose={() => setRejecting(null)} onReject={async (note) => { await decide(rejecting, "rejected", note); setRejecting(null); }} />}
    </>
  );
}

function RejectDialog({ expense, onClose, onReject }: { expense: Expense; onClose: () => void; onReject: (note: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  return (
    <ModalPortal><div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="reject-title">
      <form className="confirm-dialog max-w-md w-full text-left" onSubmit={(e) => { e.preventDefault(); void onReject(note); }}>
        <button type="button" className="icon-button dialog-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <span className="card-kicker">REJECT CLAIM</span>
        <h2 id="reject-title">{expense.employee?.full_name}: {formatMoney(expense.amount, expense.currency)}</h2>
        <label className="field mt-4"><span>Reason (the employee will see this)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} required placeholder="e.g. Please attach the receipt and resubmit" />
        </label>
        <div className="dialog-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary">Reject claim</button>
        </div>
      </form>
    </div></ModalPortal>
  );
}
