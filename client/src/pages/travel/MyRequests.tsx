import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cancelMyRequest, createMyRequest, listMyRequests, type TravelRequest } from "../../lib/data/travel";
import { Empty, ErrorNotice, Loading, PageHeader, StatusPill, formatDate, formatMoney, labelFor } from "./common";

const BLANK = { origin: "", destination: "", departure_date: "", return_date: "", purpose: "", travel_type: "flight", estimated_cost: "" };

/** Submit and track your own travel requests. Approver routing is done by the database. */
export default function MyRequests({ profileId }: { profileId: string }) {
  const [rows, setRows] = useState<TravelRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
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

  const set = (key: keyof typeof BLANK) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      await createMyRequest(profileId, { ...form, estimated_cost: form.estimated_cost === "" ? undefined : form.estimated_cost } as never);
      toast.success("Request sent to your manager for approval");
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
        eyebrow="REQUESTS"
        title="My travel requests"
        description="New requests go to your manager automatically."
        actions={<button type="button" className="button button-primary" onClick={() => setOpen(true)}><Plus size={16} /> New request</button>}
      />
      {error && <ErrorNotice message={error} onRetry={load} />}
      <div className="panel table-panel">
        {loading ? <Loading /> : rows.length === 0 ? <Empty title="No requests yet" description="Use “New request” to ask for a trip." /> : (
          <div className="responsive-table">
            <table>
              <thead><tr><th>Travel date</th><th>Route</th><th>Purpose</th><th className="text-right">Estimate</th><th>Approver</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.departure_date)}{r.return_date && <div className="table-subline">back {formatDate(r.return_date)}</div>}</td>
                    <td>{r.origin} → {r.destination}<div className="table-subline">{labelFor(r.travel_type)}</div></td>
                    <td className="max-w-[260px] truncate" title={r.purpose}>{r.purpose}</td>
                    <td className="text-right">{formatMoney(r.estimated_cost, r.currency)}</td>
                    <td>{r.approver?.full_name ?? "—"}</td>
                    <td><StatusPill status={r.status} /></td>
                    <td>{r.status === "pending" && <button type="button" className="table-action table-action-danger" onClick={() => cancel(r.id)}>Cancel</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="new-request-title">
          <form className="confirm-dialog max-w-xl w-full text-left max-h-[90vh] overflow-y-auto" onSubmit={submit}>
            <button type="button" className="icon-button dialog-close" onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button>
            <span className="card-kicker">TRAVEL REQUEST</span>
            <h2 id="new-request-title">New request</h2>
            <div className="grid gap-3 sm:grid-cols-2 mt-4">
              <label className="field"><span>From</span><input value={form.origin} onChange={set("origin")} required maxLength={120} /></label>
              <label className="field"><span>To</span><input value={form.destination} onChange={set("destination")} required maxLength={120} /></label>
              <label className="field"><span>Travel date</span><input type="date" value={form.departure_date} onChange={set("departure_date")} required /></label>
              <label className="field"><span>Return date</span><input type="date" value={form.return_date} onChange={set("return_date")} /></label>
              <label className="field"><span>Mode</span>
                <select value={form.travel_type} onChange={set("travel_type")}>
                  {["flight", "train", "bus", "cab", "hotel", "multi_modal", "other"].map((t) => <option key={t} value={t}>{labelFor(t)}</option>)}
                </select>
              </label>
              <label className="field"><span>Estimated cost (₹)</span><input type="number" min="0" step="1" inputMode="numeric" value={form.estimated_cost} onChange={set("estimated_cost")} /></label>
              <label className="field sm:col-span-2"><span>Purpose</span><textarea value={form.purpose} onChange={set("purpose")} required minLength={3} maxLength={2000} rows={3} /></label>
            </div>
            {formError && <p className="text-sm text-red-600 mt-3" role="alert">{formError}</p>}
            <div className="dialog-actions">
              <button type="button" className="button button-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className="button button-primary" disabled={saving}>{saving ? "Sending…" : "Submit request"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
