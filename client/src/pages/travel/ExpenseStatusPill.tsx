import type { ExpenseStatus } from "../../lib/data/expenses";

const TONE: Record<ExpenseStatus, string> = {
  submitted: "pending-approval",
  approved: "approved",
  reimbursed: "booked",
  rejected: "rejected",
  withdrawn: "cancelled",
};

const LABEL: Record<ExpenseStatus, string> = {
  submitted: "Waiting for review",
  approved: "Approved",
  reimbursed: "Reimbursed",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export function ExpenseStatusPill({ status }: { status: ExpenseStatus }) {
  return <span className={`status-badge status-${TONE[status]}`}><span className="status-dot" />{LABEL[status]}</span>;
}
