import { CheckCircle2, Clock3, Plane, XCircle } from "lucide-react";
import { TIME_LABEL, type TravelRequest } from "../../lib/data/travel";
import { formatDate, formatMoney, labelFor } from "./common";

const TONE: Record<string, string> = {
  pending: "pending-approval",
  approved: "approved",
  rejected: "rejected",
  cancelled: "cancelled",
  booked: "booked",
  completed: "completed",
};
const WORD: Record<string, string> = {
  pending: "Waiting for approval",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  booked: "Booked",
  completed: "Completed",
};

export function RequestStatusBadge({ status }: { status: string }) {
  return <span className={`status-badge status-${TONE[status] ?? "pending-approval"}`}><span className="status-dot" />{WORD[status] ?? status}</span>;
}

function when(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** What the CEO or Admin decided, in words the employee can read. */
export function RequestDecision({ r, forEmployee = true }: { r: TravelRequest; forEmployee?: boolean }) {
  if (r.status === "pending") {
    return (
      <div className="flex items-start gap-2 text-sm">
        <Clock3 size={16} className="mt-0.5 shrink-0 text-amber-600" />
        <span>Sent to the CEO and Admin on {when(r.created_at)}. {forEmployee ? "You will see their decision here." : "Waiting for one of them to decide."}</span>
      </div>
    );
  }
  if (r.status === "cancelled") return <div className="text-sm opacity-70">{forEmployee ? "You cancelled this request." : "The employee cancelled this request."}</div>;
  const ok = r.status !== "rejected";
  const who = r.decided_by_name ? `${r.decided_by_name}${r.decided_by_role ? ` (${r.decided_by_role})` : ""}` : r.approver?.full_name ?? "the approver";
  return (
    <div className="grid gap-1 text-sm">
      <div className="flex items-start gap-2">
        {ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-600" /> : <XCircle size={16} className="mt-0.5 shrink-0 text-red-600" />}
        <span><strong>{ok ? "Approved" : "Rejected"}</strong> by {who}{r.decided_at ? ` on ${when(r.decided_at)}` : ""}</span>
      </div>
      {r.decision_comment && <div className="text-sm pl-6 whitespace-pre-wrap break-words">“{r.decision_comment}”</div>}
      {r.status === "booked" && <div className="flex items-center gap-2 pl-6 text-sm"><Plane size={14} /> {forEmployee ? "Your trip is booked. The ticket is in your travel history." : "Booked. The trip is in the employee's travel history."}</div>}
      {forEmployee && r.status === "approved" && <div className="pl-6 text-xs opacity-70">The Admin will book it and the ticket will appear in your travel history.</div>}
    </div>
  );
}

/** Every detail the employee gave, as label and value pairs. */
export function RequestDetails({ r }: { r: TravelRequest }) {
  const rows: Array<[string, string]> = [
    ["Route", `${r.origin} → ${r.destination}`],
    ["Mode", labelFor(r.travel_type)],
    ["Travel date", `${formatDate(r.departure_date)}${r.preferred_time ? ` · ${TIME_LABEL[r.preferred_time] ?? r.preferred_time}` : ""}`],
    ["Return", r.return_date ? `${formatDate(r.return_date)}${r.return_preferred_time ? ` · ${TIME_LABEL[r.return_preferred_time] ?? r.return_preferred_time}` : ""}` : "One way"],
    ["Project", r.project_name || "—"],
    ["Estimated cost", formatMoney(r.estimated_cost, r.currency)],
    ["Hotel", r.hotel_required ? `${r.hotel_city || r.destination}${r.hotel_check_in ? `, ${formatDate(r.hotel_check_in)}` : ""}${r.hotel_check_out ? ` to ${formatDate(r.hotel_check_out)}` : ""}` : "Not needed"],
    ["Contact", r.contact_phone || "—"],
  ];
  return (
    <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-2 min-w-0"><span className="opacity-60 w-28 shrink-0">{k}</span><span className="min-w-0 break-words">{v}</span></div>
      ))}
      <div className="sm:col-span-2 flex gap-2 min-w-0"><span className="opacity-60 w-28 shrink-0">Purpose</span><span className="min-w-0 whitespace-pre-wrap break-words">{r.purpose}</span></div>
      {r.notes && <div className="sm:col-span-2 flex gap-2 min-w-0"><span className="opacity-60 w-28 shrink-0">Notes</span><span className="min-w-0 whitespace-pre-wrap break-words">{r.notes}</span></div>}
    </div>
  );
}
