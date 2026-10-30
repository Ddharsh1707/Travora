import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { decideRequest, listPendingApprovals, type TravelRequest } from "../../lib/data/travel";
import { Empty, ErrorNotice, Loading, PageHeader, formatDate, formatMoney, labelFor } from "./common";

/**
 * Requests waiting for the signed-in approver. The list is limited by RLS and
 * every decision is re-checked by decide_travel_request() in the database.
 */
export default function ApprovalQueue({ profileId }: { profileId: string }) {
  const [rows, setRows] = useState<TravelRequest[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await listPendingApprovals(profileId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load approvals.");
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => { void load(); }, [load]);

  async function decide(id: string, decision: "approved" | "rejected") {
    if (decision === "rejected" && !comments[id]?.trim()) {
      toast.error("Please add a reason before rejecting.");
      return;
    }
    setBusy(id);
    try {
      await decideRequest(id, decision, comments[id]);
      toast.success(decision === "approved" ? "Request approved" : "Request rejected");
      setRows((rs) => rs.filter((r) => r.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record the decision.");
      void load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="page-stack animate-page">
      <PageHeader eyebrow="APPROVALS" title="Waiting for your approval" description="Requests from your team, soonest travel first." />
      {error && <ErrorNotice message={error} onRetry={load} />}
      {loading ? <Loading /> : rows.length === 0 ? (
        <div className="panel"><Empty title="Nothing to approve" description="New requests from your team will show up here." /></div>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <div key={r.id} className="panel p-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
              <div className="min-w-0">
                <div className="font-semibold">{r.employee?.full_name ?? "Employee"} <span className="opacity-60 font-normal text-xs">{r.employee?.employee_id}{r.employee?.department ? ` · ${r.employee.department}` : ""}</span></div>
                <div className="text-sm mt-1">{r.origin} → {r.destination} · {labelFor(r.travel_type)} · {formatDate(r.departure_date)}{r.return_date ? ` to ${formatDate(r.return_date)}` : ""}</div>
                <div className="text-xs opacity-70 mt-1">Estimate {formatMoney(r.estimated_cost, r.currency)}</div>
                <p className="text-sm mt-2 whitespace-pre-wrap break-words">{r.purpose}</p>
                <label className="field mt-2">
                  <span>Comment (required to reject)</span>
                  <input value={comments[r.id] ?? ""} onChange={(e) => setComments((c) => ({ ...c, [r.id]: e.target.value }))} maxLength={2000} />
                </label>
              </div>
              <div className="flex md:flex-col gap-2">
                <button type="button" className="button button-primary" disabled={busy === r.id} onClick={() => decide(r.id, "approved")}>Approve</button>
                <button type="button" className="button button-ghost" disabled={busy === r.id} onClick={() => decide(r.id, "rejected")}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
