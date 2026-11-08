import { useState, useMemo, useEffect } from "react";
import {
  WalletCards,
  Plus,
  Download,
  Filter,
  Search,
  CheckCircle2,
  Clock3,
  Receipt,
  FileCheck2,
  DollarSign,
  Coffee,
  Plane,
  Building,
  Car,
  Package,
  Sparkles,
  X,
  Upload,
  Check,
  XCircle,
  RotateCcw,
  RefreshCw,
  Trash2,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import type { Expense, Journey } from "../types";
import { exportToCsv } from "../utils/exportCsv";
import { expenseApi, type BackendExpense, type AuthUser } from "../lib/api";

const CATEGORY_ICONS: Record<string, any> = {
  Flight: Plane,
  Hotel: Building,
  Meals: Coffee,
  Transport: Car,
  "Per Diem": DollarSign,
  Supplies: Package,
  Other: Receipt,
};

function toFrontendCategory(cat: string): Expense["category"] {
  switch (cat) {
    case "FLIGHT": return "Flight";
    case "ACCOMMODATION": return "Hotel";
    case "MEALS": return "Meals";
    case "TAXI": return "Transport";
    default: return "Other";
  }
}

function toBackendCategory(cat: Expense["category"]): string {
  switch (cat) {
    case "Flight": return "FLIGHT";
    case "Hotel": return "ACCOMMODATION";
    case "Meals": return "MEALS";
    case "Transport": return "TAXI";
    default: return "OTHER";
  }
}

function toFrontendStatus(st: string): Expense["status"] {
  switch (st) {
    case "APPROVED": return "Approved";
    case "REIMBURSED": return "Reimbursed";
    case "REJECTED": return "Rejected";
    default: return "Submitted";
  }
}

function backendToExpense(b: BackendExpense): Expense {
  return {
    id: `EXP-${b.id}`,
    backendId: b.id,
    destination: b.travelRequestId ? `Trip #${b.travelRequestId}` : "Corporate Travel",
    category: toFrontendCategory(b.category),
    amount: Number(b.amount),
    currency: b.currency || "INR",
    date: b.expenseDate,
    merchant: b.merchant,
    status: toFrontendStatus(b.status),
    receiptName: b.receiptName || (b.receiptUrl ? "receipt_attachment.pdf" : undefined),
    notes: b.description || undefined,
    employeeName: b.employeeName,
    companyName: b.companyName,
    approverName: b.approverName || undefined,
    approvalComment: b.approvalComment || undefined,
  };
}

export function Expenses({ journeys = [], user }: { journeys?: Journey[]; user?: AuthUser | null }) {
  const companyPrefix = user?.companyId ? `c${user.companyId}` : "nocompany";
  const userKey = user?.employeeId || (user?.id ? String(user.id) : "guest");
  const storageKey = `trapple_expenses_${companyPrefix}_${userKey}`;

  const [expenses, setExpenses] = useState<Expense[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Form State
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [category, setCategory] = useState<Expense["category"]>("Meals");
  const [destination, setDestination] = useState(journeys[0]?.destination || "Corporate Travel");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [receiptFile, setReceiptFile] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const canApprove =
    user?.role === "APPROVER" ||
    user?.role === "ADMIN" ||
    user?.role === "COMPANY_ADMIN" ||
    user?.role === "PLATFORM_ADMIN";

  const canReimburse =
    user?.role === "TRAVEL_DESK" ||
    user?.role === "ADMIN" ||
    user?.role === "COMPANY_ADMIN" ||
    user?.role === "PLATFORM_ADMIN";

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const data = await expenseApi.getAll();
      if (Array.isArray(data)) {
        const mapped = data.map(backendToExpense);
        setExpenses(mapped);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to sync expenses with server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [userKey, companyPrefix]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(expenses));
    } catch {}
  }, [expenses, storageKey]);

  const stats = useMemo(() => {
    const totalClaimed = expenses.reduce((sum, item) => sum + item.amount, 0);
    const reimbursed = expenses
      .filter((item) => item.status === "Reimbursed")
      .reduce((sum, item) => sum + item.amount, 0);
    const approved = expenses
      .filter((item) => item.status === "Approved")
      .reduce((sum, item) => sum + item.amount, 0);
    const pending = expenses
      .filter((item) => item.status === "Submitted")
      .reduce((sum, item) => sum + item.amount, 0);

    return { totalClaimed, reimbursed, approved, pending };
  }, [expenses]);

  const filtered = useMemo(() => {
    return expenses.filter((item) => {
      const matchesQuery =
        item.merchant.toLowerCase().includes(query.toLowerCase()) ||
        item.destination.toLowerCase().includes(query.toLowerCase()) ||
        item.id.toLowerCase().includes(query.toLowerCase()) ||
        (item.employeeName && item.employeeName.toLowerCase().includes(query.toLowerCase()));
      const matchesCategory = categoryFilter === "ALL" || item.category === categoryFilter;
      const matchesStatus = statusFilter === "ALL" || item.status === statusFilter;
      return matchesQuery && matchesCategory && matchesStatus;
    });
  }, [expenses, query, categoryFilter, statusFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchant || !amount || Number(amount) <= 0) {
      toast.error("Please provide valid merchant and amount.");
      return;
    }

    try {
      const created = await expenseApi.create({
        category: toBackendCategory(category),
        amount: Number(amount),
        currency,
        expenseDate,
        merchant,
        description: notes || undefined,
        receiptName: receiptFile || undefined,
      });
      const newExp = backendToExpense(created);
      setExpenses((prev) => [newExp, ...prev.filter((x) => x.id !== newExp.id)]);
      toast.success("Expense claim submitted to server.");
      setIsCreateOpen(false);
      setMerchant("");
      setAmount("");
      setNotes("");
      setReceiptFile(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit expense claim to server.");
    }
  };

  const handleApprove = async (item: Expense) => {
    if (!item.backendId) {
      toast.error("Cannot approve an unpersisted local expense record.");
      return;
    }
    try {
      const res = await expenseApi.approve(item.backendId, "Approved via management portal");
      const updated = backendToExpense(res);
      setExpenses((prev) => prev.map((e) => (e.backendId === item.backendId ? updated : e)));
      toast.success(`Expense ${item.id} approved successfully.`);
    } catch (err: any) {
      toast.error(err.message || "Failed to approve expense.");
    }
  };

  const handleReject = async (item: Expense) => {
    if (!item.backendId) {
      toast.error("Cannot reject an unpersisted local expense record.");
      return;
    }
    const comment = prompt("Please provide a reason for rejection:") || "Rejected by reviewer";
    try {
      const res = await expenseApi.reject(item.backendId, comment);
      const updated = backendToExpense(res);
      setExpenses((prev) => prev.map((e) => (e.backendId === item.backendId ? updated : e)));
      toast.info(`Expense ${item.id} rejected.`);
    } catch (err: any) {
      toast.error(err.message || "Failed to reject expense.");
    }
  };

  const handleReimburse = async (item: Expense) => {
    if (!item.backendId) {
      toast.error("Cannot reimburse an unpersisted local expense record.");
      return;
    }
    try {
      const res = await expenseApi.reimburse(item.backendId);
      const updated = backendToExpense(res);
      setExpenses((prev) => prev.map((e) => (e.backendId === item.backendId ? updated : e)));
      toast.success(`Expense ${item.id} reimbursed successfully.`);
    } catch (err: any) {
      toast.error(err.message || "Failed to mark expense as reimbursed.");
    }
  };

  const handleDelete = async (item: Expense) => {
    if (!confirm(`Delete claim ${item.id}?`)) return;
    if (item.backendId) {
      try {
        await expenseApi.delete(item.backendId);
      } catch (err: any) {
        toast.error(err.message || "Failed to delete expense from server.");
        return;
      }
    }
    setExpenses((prev) => prev.filter((e) => e.id !== item.id));
    toast.success("Expense claim deleted.");
  };

  const handleExportCsv = () => {
    const headers = [
      "Expense ID",
      "Employee",
      "Merchant",
      "Category",
      "Amount",
      "Currency",
      "Destination",
      "Date",
      "Status",
      "Approver",
      "Notes",
    ];
    const rows = filtered.map((item) => [
      item.id,
      item.employeeName || "",
      item.merchant,
      item.category,
      item.amount,
      item.currency,
      item.destination,
      item.date,
      item.status,
      item.approverName || "",
      item.notes || "",
    ]);
    exportToCsv("trapple_expenses", headers, rows);
    toast.success("Expense log exported to CSV.");
  };

  return (
    <div className="page-stack animate-page">
      {/* Header */}
      <div className="page-heading">
        <div>
          <p className="eyebrow">Corporate travel & spend</p>
          <h1>Expense Management</h1>
          <p className="page-description">
            Submit trip out-of-pocket expenses, attach receipts, manage approvals, and disburse reimbursements.
            {user?.companyName && (
              <span className="inline-flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#E6F4EA] text-[#137333] dark:bg-[#137333]/20 dark:text-[#81C995]">
                <Building2 size={12} /> {user.companyName}
              </span>
            )}
          </p>
        </div>
        <div className="heading-actions flex items-center gap-3">
          <button
            type="button"
            onClick={fetchExpenses}
            className="button button-ghost flex items-center gap-2"
            title="Refresh from server"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="button button-ghost flex items-center gap-2"
          >
            <Download size={15} /> Export CSV
          </button>
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="button button-primary flex items-center gap-2"
          >
            <Plus size={16} /> Log Expense
          </button>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-icon"><WalletCards size={18} /></span>
            <span className="stat-detail">Total claimed</span>
          </div>
          <strong className="stat-value">₹{stats.totalClaimed.toLocaleString("en-IN")}</strong>
          <span className="stat-label">{expenses.length} claims on record</span>
        </div>

        <div className="stat-card stat-accent">
          <div className="stat-card-top">
            <span className="stat-icon"><CheckCircle2 size={18} /></span>
            <span className="stat-detail">Settled to bank</span>
          </div>
          <strong className="stat-value">₹{stats.reimbursed.toLocaleString("en-IN")}</strong>
          <span className="stat-label">Reimbursed directly</span>
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-icon"><FileCheck2 size={18} /></span>
            <span className="stat-detail">Approved pending payout</span>
          </div>
          <strong className="stat-value">₹{stats.approved.toLocaleString("en-IN")}</strong>
          <span className="stat-label">Ready for finance desk</span>
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-icon"><Clock3 size={18} /></span>
            <span className="stat-detail">In review</span>
          </div>
          <strong className="stat-value">₹{stats.pending.toLocaleString("en-IN")}</strong>
          <span className="stat-label">Awaiting managerial sign-off</span>
        </div>
      </section>

      {/* Filter and Search Bar */}
      <div className="panel space-y-4">
        <div className="table-filter-bar flex flex-wrap items-center justify-between gap-3">
          <div className="search-field flex-1 min-w-[240px]">
            <Search size={16} />
            <input
              placeholder="Search by merchant, employee, claim ID, or destination..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-[#52616a] dark:text-[#9bb0ac]">
              <Filter size={14} />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="ALL">All categories</option>
                <option value="Flight">Flight</option>
                <option value="Hotel">Hotel</option>
                <option value="Meals">Meals</option>
                <option value="Transport">Transport</option>
                <option value="Per Diem">Per Diem</option>
                <option value="Supplies">Supplies</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All statuses</option>
              <option value="Submitted">Submitted</option>
              <option value="Approved">Approved</option>
              <option value="Reimbursed">Reimbursed</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
        </div>

        {/* Expenses Table */}
        {filtered.length ? (
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Expense / Merchant</th>
                  <th>Category</th>
                  <th>Trip / Destination</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Receipt</th>
                  <th>Status</th>
                  {(canApprove || canReimburse) && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const Icon = CATEGORY_ICONS[item.category] || Receipt;
                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="table-journey">
                          <span className="w-8 h-8 rounded-lg bg-[#F1F5F9] dark:bg-[#1E293B] flex items-center justify-center text-[#F2A93B]">
                            <Icon size={16} />
                          </span>
                          <span>
                            <strong>{item.merchant}</strong>
                            <small className="block text-xs text-muted">
                              {item.id} {item.employeeName ? `• ${item.employeeName}` : ""}
                            </small>
                          </span>
                        </div>
                      </td>
                      <td>{item.category}</td>
                      <td>{item.destination}</td>
                      <td>{item.date}</td>
                      <td>
                        <strong className="text-sm font-semibold">
                          ₹{item.amount.toLocaleString("en-IN")}
                        </strong>
                      </td>
                      <td>
                        {item.receiptName ? (
                          <span className="inline-flex items-center gap-1 text-xs text-[#52616a] dark:text-[#9bb0ac] hover:underline cursor-pointer">
                            <Receipt size={13} /> {item.receiptName}
                          </span>
                        ) : (
                          <span className="text-xs text-[#839099]">—</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`status-badge ${
                            item.status === "Reimbursed"
                              ? "status-completed"
                              : item.status === "Approved"
                              ? "status-approved"
                              : item.status === "Rejected"
                              ? "status-rejected"
                              : "status-pending-approval"
                          }`}
                        >
                          <span className="status-dot" />
                          {item.status}
                        </span>
                      </td>
                      {(canApprove || canReimburse) && (
                        <td>
                          <div className="flex items-center gap-1.5">
                            {canApprove && item.status === "Submitted" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleApprove(item)}
                                  className="p-1.5 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                                  title="Approve claim"
                                >
                                  <Check size={15} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleReject(item)}
                                  className="p-1.5 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400"
                                  title="Reject claim"
                                >
                                  <XCircle size={15} />
                                </button>
                              </>
                            )}
                            {canReimburse && item.status === "Approved" && (
                              <button
                                type="button"
                                onClick={() => handleReimburse(item)}
                                className="px-2 py-1 rounded-md text-xs font-semibold bg-[#F2A93B] text-white hover:bg-[#E8961C]"
                                title="Disburse payment"
                              >
                                Reimburse
                              </button>
                            )}
                            {(user?.role === "ADMIN" || item.status === "Submitted") && (
                              <button
                                type="button"
                                onClick={() => handleDelete(item)}
                                className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-red-500"
                                title="Delete claim"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state py-12 text-center space-y-2">
            <div className="empty-icon mx-auto"><Receipt size={24} /></div>
            <h3>No expenses found</h3>
            <p className="text-sm text-[#839099]">
              {query || categoryFilter !== "ALL" || statusFilter !== "ALL"
                ? "Try adjusting your filters or search terms."
                : "Log your first business expense to track reimbursements."}
            </p>
          </div>
        )}
      </div>

      {/* Log Expense Modal Dialog */}
      {isCreateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in"
          onClick={() => setIsCreateOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-[#111827] rounded-2xl shadow-xl border border-[#E4E7EC] dark:border-[#1E293B] p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E4E7EC] dark:border-[#1E293B] pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#F2A93B]">
                  TRAVEL REIMBURSEMENT
                </span>
                <h2 className="text-xl font-bold text-[#0F1A22] dark:text-[#F8FAFC]">
                  Log Business Expense
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="text-[#667085] hover:text-[#0F1A22] dark:hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="field">
                  <span>Merchant / Vendor *</span>
                  <input
                    required
                    value={merchant}
                    onChange={(e) => setMerchant(e.target.value)}
                    placeholder="e.g. Air India, Marriott"
                  />
                </label>
                <label className="field">
                  <span>Category</span>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                  >
                    <option value="Flight">Flight</option>
                    <option value="Hotel">Hotel</option>
                    <option value="Meals">Meals</option>
                    <option value="Transport">Transport</option>
                    <option value="Per Diem">Per Diem</option>
                    <option value="Supplies">Supplies</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="field">
                  <span>Amount (INR) *</span>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </label>
                <label className="field">
                  <span>Expense Date</span>
                  <input
                    type="date"
                    required
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                  />
                </label>
              </div>

              <label className="field">
                <span>Associated Journey</span>
                <input
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="e.g. Bengaluru Tech Hub"
                />
              </label>

              {/* Receipt simulated upload */}
              <div>
                <span className="block text-xs font-semibold text-[#52616a] dark:text-[#9bb0ac] mb-1.5">
                  Receipt Attachment
                </span>
                <label className="border-2 border-dashed border-[#E4E7EC] dark:border-[#1E293B] rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B] transition-colors">
                  <Upload size={20} className="text-[#94A3B8] mb-1" />
                  <span className="text-xs text-[#0F1A22] dark:text-[#F8FAFC] font-medium">
                    {receiptFile || "Click to upload bill / receipt PDF or image"}
                  </span>
                  <span className="text-[10px] text-[#94A3B8]">Max size: 10MB</span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setReceiptFile(e.target.files[0].name);
                        toast.success("Receipt attached successfully.");
                      }
                    }}
                  />
                </label>
              </div>

              <label className="field">
                <span>Business Purpose / Notes</span>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Brief note for your approver"
                />
              </label>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="button button-ghost"
                >
                  Cancel
                </button>
                <button type="submit" className="button button-primary">
                  Submit Claim
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
