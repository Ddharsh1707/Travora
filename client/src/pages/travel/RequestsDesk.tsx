import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Plane, Search, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useLiveRefresh } from "../../lib/data/reports";
import { decideRequest, listAllRequests, type RequestStatus, type TravelRequest } from "../../lib/data/travel";
import { Empty, ErrorNotice, Loading, PageHeader, Stat, formatDate } from "./common";
import { RequestDecision, RequestDetails, RequestStatusBadge } from "./RequestParts";
import { TravelRecordDialog } from "./TravelRecordDialog";
import { RequestTickets, useRequestTickets } from "./RequestTickets";

const TABS: Array<{ key: RequestStatus | "all"; label: string }> = [
  { key: "pending", label: "Waiting for a decision" },
  { key: "approved", label: "Approved, add ticket" },
  { key: "booked", label: "Booked" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

/**
 * Travel requests for the CEO and the Admin. Both see the same list at the
 * same time; whoever decides first wins and the other sees the result live.
 * The database re-checks every decision (an Admin cannot decide for the CEO
 * or another Admin).
 */
export default function RequestsDesk({ profileId, isCeo }: { profileId: string; isCeo: boolean }) {
  const [rows, setRows] = useState<TravelRequest[]>([]);
  const [tab, setTab] = useState<RequestStatus | "all">("pending");
  const [q, setQ] = useState("");
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [booking, setBooking] = useState<TravelRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setRows(await listAllRequests({ status: "all", limit: 500 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load travel requests.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(["travel_requests"], load);

  const { byRequest, reload: reloadTickets } = useRequestTickets(rows);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows
      .filter((r) => tab === "all" || r.status === tab)
      .filter((r) => !term || [r.employee?.full_name, r.employee?.employee_id, r.origin, r.destination, r.project_name, r.purpose]
        .some((v) => (v ?? "").toLowerCase().includes(term)))
      .sort((a, b) => (tab === "pending" ? a.departure_date.localeCompare(b.departure_date) : b.created_at.localeCompare(a.created_at)));
  }, [rows, tab, q]);

  async function decide(r: TravelRequest, decision: "approved" | "rejected") {
    if (decision === "rejected" && !comments[r.id]?.trim()) {
      toast.error("Please add a reason before rejecting. The employee will see it.");
      return;
    }
    setBusy(r.id);
    try {
      await decideRequest(r.id, decision, comments[r.id]);
      toast.success(decision === "approved" ? "Approved. The employee can see it now." : "Rejected. The employee can see your reason.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record the decision.");
    } finally {
      setBusy(null);
      void load();
    }
  }

  // The Admin cannot decide for the CEO or another Admin; the database says so too.
  const canDecide = (r: TravelRequest) =>
    r.employee_id !== profileId && (isCeo || !["admin", "company_admin"].includes(r.employee?.role ?? ""));

  return (
    <div className="page-stack animate-page">
      <PageHeader
        eyebrow={isCeo ? "CEO" : "ADMIN"}
        title="Travel requests"
        description="Every employee request reaches the CEO and the Admin at the same time. Whoever decides first, the employee sees the decision and your comment straight away."
      />
      {error && <ErrorNotice message={error} onRetry={load} />}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="Waiting" value={String(counts.pending ?? 0)} detail="Need a decision" />
        <Stat label="Approved" value={String(counts.approved ?? 0)} detail="Upload the ticket for each" />
        <Stat label="Booked" value={String(counts.booked ?? 0)} />
        <Stat label="Rejected" value={String(counts.rejected ?? 0)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`button ${tab === t.key ? "button-primary" : "button-ghost"}`} onClick={() => setTab(t.key)} aria-pressed={tab === t.key}>
            {t.label}{t.key !== "all" && counts[t.key] ? ` (${counts[t.key]})` : ""}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 field m-0 min-w-[220px]">
          <span className="sr-only">Search requests</span>
          <Search size={14} className="opacity-60" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, ID, place or project" />
        </label>
      </div>

      {loading ? <div className="panel"><Loading /></div> : shown.length === 0 ? (
        <div className="panel"><Empty title="Nothing here" description={tab === "pending" ? "New requests from employees appear here as soon as they are sent." : "No requests with this status."} /></div>
      ) : (
        <div className="grid gap-3">
          {shown.map((r) => (
            <article key={r.id} className="panel p-4 grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/travel/employees/${r.employee_id}`} className="font-semibold hover:underline">{r.employee?.full_name ?? "Employee"}</Link>
                <span className="text-xs opacity-60">{r.employee?.employee_id}{r.employee?.department ? ` · ${r.employee.department}` : ""}</span>
                <span className="text-xs opacity-60">· sent {formatDate(r.created_at)}</span>
                <span className="ml-auto"><RequestStatusBadge status={r.status} /></span>
              </div>
              <RequestDetails r={r} />
              {r.status === "pending" ? (
                canDecide(r) ? (
                  <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-end border-t pt-3" style={{ borderColor: "var(--line)" }}>
                    <label className="field m-0">
                      <span>Comment for the employee (required to reject)</span>
                      <input value={comments[r.id] ?? ""} onChange={(e) => setComments((c) => ({ ...c, [r.id]: e.target.value }))} maxLength={2000} placeholder="e.g. Approved, book the morning flight" />
                    </label>
                    <div className="flex gap-2">
                      <button type="button" className="button button-primary" disabled={busy === r.id} onClick={() => decide(r, "approved")}><CheckCircle2 size={15} /> Approve</button>
                      <button type="button" className="button button-ghost" disabled={busy === r.id} onClick={() => decide(r, "rejected")}><XCircle size={15} /> Reject</button>
                    </div>
                  </div>
                ) : <p className="text-xs opacity-70 border-t pt-3" style={{ borderColor: "var(--line)" }}>{r.employee_id === profileId ? "This is your own request." : "Only the CEO can decide this request."}</p>
              ) : (
                <div className="border-t pt-3 flex flex-wrap items-start gap-3" style={{ borderColor: "var(--line)" }}>
                  <div className="flex-1 min-w-0"><RequestDecision r={r} forEmployee={false} /></div>
                  {r.status === "approved" && <button type="button" className="button button-ghost" onClick={() => setBooking(r)}><Plane size={15} /> Record booking</button>}
                </div>
              )}
              <RequestTickets request={r} docs={byRequest[r.id] ?? []} canUpload onUploaded={() => void reloadTickets()} />
            </article>
          ))}
        </div>
      )}

      {booking && (
        <TravelRecordDialog
          fromRequest={booking}
          presetEmployee={{ id: booking.employee_id, name: booking.employee?.full_name ?? "Employee", code: booking.employee?.employee_id ?? "" }}
          onClose={() => setBooking(null)}
          onSaved={() => { setBooking(null); void load(); }}
        />
      )}
    </div>
  );
}
