import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useLiveRefresh } from "../../lib/data/reports";
import { TIMES_OF_DAY, cancelMyRequest, createMyRequest, listMyRequests, type TravelRequest } from "../../lib/data/travel";
import { Empty, ErrorNotice, Loading, PageHeader, Stat, labelFor } from "./common";
import { RequestDecision, RequestDetails, RequestStatusBadge } from "./RequestParts";
import { RequestTickets, useRequestTickets } from "./RequestTickets";

const BLANK = {
  origin: "", destination: "", departure_date: "", return_date: "", purpose: "", travel_type: "flight", estimated_cost: "",
  project_name: "", preferred_time: "", return_preferred_time: "", hotel_required: false, hotel_city: "", hotel_check_in: "", hotel_check_out: "",
  contact_phone: "", notes: "",
};
type Form = typeof BLANK;
const FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Waiting" },
  { key: "approved", label: "Approved" },
  { key: "booked", label: "Booked" },
  { key: "rejected", label: "Rejected" },
] as const;

/**
 * The employee's side of travel: describe the trip, send it, and see what the
 * CEO or Admin decided. The request goes to both of them at the same time.
 */
export default function MyRequests({ profileId }: { profileId: string }) {
  const [rows, setRows] = useState<TravelRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(BLANK);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");

  const load = useCallback(async () => {
    setError("");
    try {
      setRows(await listMyRequests(profileId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your requests.");
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => { void load(); }, [load]);
  // A decision by the CEO or Admin shows up without reloading the page.
  useLiveRefresh(["travel_requests"], load);

  const counts = useMemo(() => ({
    pending: rows.filter((r) => r.status === "pending").length,
    approved: rows.filter((r) => r.status === "approved" || r.status === "booked" || r.status === "completed").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
  }), [rows]);
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  // Tickets the CEO or Admin uploaded for approved trips.
  const { byRequest } = useRequestTickets(rows);

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target instanceof HTMLInputElement && e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      await createMyRequest(profileId, { ...form, estimated_cost: form.estimated_cost === "" ? undefined : form.estimated_cost } as never);
      toast.success("Request sent to the CEO and Admin");
      setForm(BLANK);
      setOpen(false);
      void load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not submit the request.");
    } finally {
      setSaving(false);
    }
  }

  async function cancel(id: string) {
    if (!window.confirm("Cancel this request?")) return;
    try {
      await cancelMyRequest(id);
      toast.success("Request cancelled");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel the request.");
    }
  }

  return (
    <div className="page-stack animate-page">
      <PageHeader
        eyebrow="MY TRAVEL"
        title="My travel requests"
        description="Tell us about the trip. Your request goes to the CEO and the Admin at the same time, and their decision shows here."
        actions={<button type="button" className="button button-primary" onClick={() => setOpen(true)}><Plus size={16} /> New travel request</button>}
      />
      {error && <ErrorNotice message={error} onRetry={load} />}

      <div className="grid gap-3 grid-cols-3">
        <Stat label="Waiting" value={String(counts.pending)} detail="Not decided yet" />
        <Stat label="Approved" value={String(counts.approved)} detail="Including booked trips" />
        <Stat label="Rejected" value={String(counts.rejected)} detail="See the reason below" />
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter requests">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className={`button ${filter === f.key ? "button-primary" : "button-ghost"}`} onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>

      {loading ? <div className="panel"><Loading /></div> : shown.length === 0 ? (
        <div className="panel"><Empty title={rows.length ? "Nothing here" : "No requests yet"} description={rows.length ? "No requests with this status." : "Use “New travel request” to ask for a trip."} /></div>
      ) : (
        <div className="grid gap-3">
          {shown.map((r) => (
            <article key={r.id} className="panel p-4 grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-base">{r.origin} → {r.destination}</strong>
                <span className="text-xs opacity-70">{labelFor(r.travel_type)}</span>
                <span className="ml-auto"><RequestStatusBadge status={r.status} /></span>
              </div>
              <RequestDetails r={r} />
              <div className="border-t pt-3 flex flex-wrap items-start gap-3" style={{ borderColor: "var(--line)" }}>
                <div className="flex-1 min-w-0"><RequestDecision r={r} /></div>
                {r.status === "pending" && <button type="button" className="table-action table-action-danger" onClick={() => cancel(r.id)}>Cancel request</button>}
              </div>
              <RequestTickets request={r} docs={byRequest[r.id] ?? []} canUpload={false} />
            </article>
          ))}
        </div>
      )}

      {open && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="new-request-title">
          <form className="confirm-dialog max-w-2xl w-full text-left max-h-[90vh] overflow-y-auto" onSubmit={submit}>
            <button type="button" className="icon-button dialog-close" onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button>
            <span className="card-kicker">TRAVEL REQUEST</span>
            <h2 id="new-request-title">Tell us about your trip</h2>
            <p className="text-xs opacity-70 mt-1">The CEO and the Admin both get this request. The Admin books the tickets once it is approved.</p>

            <h3 className="card-kicker mt-4">Journey</h3>
            <div className="grid gap-3 sm:grid-cols-2 mt-2">
              <label className="field"><span>From</span><input value={form.origin} onChange={set("origin")} required maxLength={120} placeholder="City or station" /></label>
              <label className="field"><span>To</span><input value={form.destination} onChange={set("destination")} required maxLength={120} placeholder="City or station" /></label>
              <label className="field"><span>Travel date</span><input type="date" value={form.departure_date} onChange={set("departure_date")} required /></label>
              <label className="field"><span>Preferred time</span>
                <select value={form.preferred_time} onChange={set("preferred_time")}>
                  <option value="">No preference</option>
                  {TIMES_OF_DAY.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </label>
              <label className="field"><span>Return date (leave empty for one way)</span><input type="date" value={form.return_date} onChange={set("return_date")} min={form.departure_date || undefined} /></label>
              <label className="field"><span>Return time</span>
                <select value={form.return_preferred_time} onChange={set("return_preferred_time")} disabled={!form.return_date}>
                  <option value="">No preference</option>
                  {TIMES_OF_DAY.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </label>
              <label className="field"><span>Mode</span>
                <select value={form.travel_type} onChange={set("travel_type")}>
                  {["flight", "train", "bus", "cab", "hotel", "multi_modal", "other"].map((t) => <option key={t} value={t}>{labelFor(t)}</option>)}
                </select>
              </label>
              <label className="field"><span>Estimated cost (₹, optional)</span><input type="number" min="0" step="1" inputMode="numeric" value={form.estimated_cost} onChange={set("estimated_cost")} /></label>
            </div>

            <h3 className="card-kicker mt-4">Work</h3>
            <div className="grid gap-3 sm:grid-cols-2 mt-2">
              <label className="field"><span>Project / site</span><input value={form.project_name} onChange={set("project_name")} maxLength={200} placeholder="e.g. HRRL Refinery" /></label>
              <label className="field"><span>Phone during travel</span><input type="tel" value={form.contact_phone} onChange={set("contact_phone")} maxLength={20} placeholder="+91 98480 12345" /></label>
              <label className="field sm:col-span-2"><span>Purpose of the trip</span><textarea value={form.purpose} onChange={set("purpose")} required minLength={3} maxLength={2000} rows={2} /></label>
            </div>

            <h3 className="card-kicker mt-4">Stay</h3>
            <label className="flex items-center gap-2 text-sm mt-2"><input type="checkbox" checked={form.hotel_required} onChange={set("hotel_required")} /> I need a hotel</label>
            {form.hotel_required && (
              <div className="grid gap-3 sm:grid-cols-3 mt-2">
                <label className="field"><span>Hotel city</span><input value={form.hotel_city} onChange={set("hotel_city")} maxLength={120} placeholder={form.destination || "City"} /></label>
                <label className="field"><span>Check-in</span><input type="date" value={form.hotel_check_in} onChange={set("hotel_check_in")} /></label>
                <label className="field"><span>Check-out</span><input type="date" value={form.hotel_check_out} onChange={set("hotel_check_out")} min={form.hotel_check_in || undefined} /></label>
              </div>
            )}
            <label className="field mt-3"><span>Anything else (seat, meal, ID proof, special needs)</span><textarea value={form.notes} onChange={set("notes")} maxLength={2000} rows={2} /></label>

            {formError && <p className="text-sm text-red-600 mt-3" role="alert">{formError}</p>}
            <div className="dialog-actions">
              <button type="button" className="button button-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className="button button-primary" disabled={saving}>{saving ? "Sending…" : "Send request"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
