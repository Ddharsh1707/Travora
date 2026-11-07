import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { createTravelRecord, listEmployees, updateTravelRecord, type EmployeeSummary, type TravelRecord, type TravelRecordInput, type TravelRequest } from "../../lib/data/travel";

/** Add or edit a trip. Only Travel Desk / Admin can save (enforced by RLS). */
export function TravelRecordDialog({ record, presetEmployee, fromRequest, onClose, onSaved }: {
  record?: TravelRecord | null;
  presetEmployee?: { id: string; name: string; code: string } | null;
  /** Booking an approved request: the trip starts from what the employee asked for. */
  fromRequest?: TravelRequest | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>(() => ({
    employee_id: record?.employee_id ?? presetEmployee?.id ?? "",
    origin: record?.origin ?? fromRequest?.origin ?? "",
    destination: record?.destination ?? fromRequest?.destination ?? "",
    departure_date: record?.departure_date ?? fromRequest?.departure_date ?? "",
    return_date: record?.return_date ?? fromRequest?.return_date ?? "",
    airline_or_provider: record?.airline_or_provider ?? "",
    booking_reference: record?.booking_reference ?? "",
    ticket_number: record?.ticket_number ?? "",
    amount: record?.amount != null ? String(record.amount) : "",
    currency: record?.currency ?? "INR",
    booking_type: record?.booking_type ?? fromRequest?.travel_type ?? "flight",
    status: record?.status ?? "confirmed",
  }));
  const [employeeLabel, setEmployeeLabel] = useState(
    record ? `${record.employee_name} (${record.employee_code})` : presetEmployee ? `${presetEmployee.name} (${presetEmployee.code})` : "",
  );
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [matches, setMatches] = useState<EmployeeSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!employeeQuery.trim()) { setMatches([]); return; }
    const handle = setTimeout(() => {
      listEmployees({ q: employeeQuery, limit: 8 }).then((r) => setMatches(r.rows)).catch(() => setMatches([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [employeeQuery]);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = { ...form, amount: form.amount === "" ? undefined : form.amount, request_id: record?.request_id ?? fromRequest?.id ?? null } as unknown as TravelRecordInput;
      if (record) await updateTravelRecord(record.id, payload);
      else await createTravelRecord(payload);
      toast.success(record ? "Trip updated" : fromRequest ? "Trip booked. The employee can see it now." : "Trip added");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the trip.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="trip-dialog-title">
      <form className="confirm-dialog max-w-2xl w-full text-left max-h-[90vh] overflow-y-auto" onSubmit={submit}>
        <button type="button" className="icon-button dialog-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <span className="card-kicker">TRAVEL RECORD</span>
        <h2 id="trip-dialog-title">{record ? "Edit trip" : fromRequest ? "Book this request" : "Add a trip"}</h2>

        <div className="grid gap-3 sm:grid-cols-2 mt-4">
          <label className="field sm:col-span-2">
            <span>Employee</span>
            {record || presetEmployee ? (
              <input value={employeeLabel} disabled />
            ) : (
              <div className="relative">
                <input
                  value={employeeLabel || employeeQuery}
                  onChange={(e) => { setEmployeeLabel(""); setForm((f) => ({ ...f, employee_id: "" })); setEmployeeQuery(e.target.value); }}
                  placeholder="Search by name or employee ID"
                  aria-autocomplete="list"
                />
                {matches.length > 0 && !form.employee_id && (
                  <ul className="absolute z-10 left-0 right-0 mt-1 panel p-1 max-h-56 overflow-y-auto" role="listbox">
                    {matches.map((m) => (
                      <li key={m.employee_id}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 rounded hover:bg-black/5 text-sm"
                          onClick={() => { setForm((f) => ({ ...f, employee_id: m.employee_id })); setEmployeeLabel(`${m.employee_name} (${m.employee_code})`); setMatches([]); }}
                        >
                          <strong>{m.employee_name}</strong> <span className="opacity-60">{m.employee_code} · {m.department ?? "—"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </label>
          <label className="field"><span>From</span><input value={form.origin ?? ""} onChange={set("origin")} required={!["hotel", "cab", "other"].includes(form.booking_type ?? "")} maxLength={120} /></label>
          <label className="field"><span>To</span><input value={form.destination} onChange={set("destination")} required maxLength={120} /></label>
          <label className="field"><span>Travel date</span><input type="date" value={form.departure_date} onChange={set("departure_date")} required /></label>
          <label className="field"><span>Return date</span><input type="date" value={form.return_date} onChange={set("return_date")} /></label>
          <label className="field"><span>Mode</span>
            <select value={form.booking_type} onChange={set("booking_type")}>
              {["flight", "train", "bus", "cab", "hotel", "multi_modal", "other"].map((t) => <option key={t} value={t}>{t.replace("_", "-")}</option>)}
            </select>
          </label>
          <label className="field"><span>Airline / provider</span><input value={form.airline_or_provider} onChange={set("airline_or_provider")} maxLength={120} /></label>
          <label className="field"><span>PNR / booking reference</span><input value={form.booking_reference} onChange={set("booking_reference")} maxLength={64} /></label>
          <label className="field"><span>Ticket number</span><input value={form.ticket_number} onChange={set("ticket_number")} maxLength={64} /></label>
          <label className="field"><span>Amount</span><input type="number" min="0" step="0.01" inputMode="decimal" value={form.amount} onChange={set("amount")} /></label>
          <label className="field"><span>Status</span>
            <select value={form.status} onChange={set("status")}>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        </div>

        {error && <p className="text-sm text-red-600 mt-3" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={saving || !form.employee_id}>{saving ? "Saving…" : "Save trip"}</button>
        </div>
      </form>
    </div>
  );
}
