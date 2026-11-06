import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Ban, CheckCircle2, FileUp, Pencil, Plus, UsersRound, X } from "lucide-react";
import { toast } from "sonner";
import { useLiveRefresh } from "../../lib/data/reports";
import { Link } from "wouter";
import {
  MAX_TRAVELLERS, cancelBulkBooking, getBulkBooking, listBulkBookings, parseEmployeeCodes, reviewBulkBooking, saveBulkBooking,
  type BulkBooking, type BulkBookingInput, type BulkMember, type BulkMemberInput,
} from "../../lib/data/bulk";
import { uploadDocument } from "../../lib/data/documents";
import { listEmployees, type EmployeeSummary } from "../../lib/data/travel";
import { Empty, ErrorNotice, Loading, PageHeader, Stat, StatusPill, formatDate, formatMoney, labelFor } from "./common";

const REVIEW_LABEL: Record<BulkBooking["review_status"], { label: string; tone: string }> = {
  pending_review: { label: "awaiting review", tone: "pending" },
  approved: { label: "budget approved", tone: "approved" },
  noted: { label: "noted", tone: "booked" },
};

/**
 * Group movements. Travel Desk / Admin create and edit them; approvers review
 * the group budget for bookings that include their team. Each traveller's trip
 * shows up in their own history automatically.
 */
export default function BulkBookings({ canManage, canReview }: { canManage: boolean; canReview: boolean }) {
  const [list, setList] = useState<BulkBooking[] | null>(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ booking: BulkBooking | null; members: BulkMember[] } | null>(null);
  const [filter, setFilter] = useState<"all" | "pending_review" | "cancelled">("all");

  const load = useCallback(() => {
    setError("");
    listBulkBookings(filter === "pending_review" ? { review: "pending_review", status: "confirmed" } : filter === "cancelled" ? { status: "cancelled" } : {})
      .then(setList)
      .catch((err) => { setList([]); setError(err instanceof Error ? err.message : "Could not load bulk bookings."); });
  }, [filter]);
  useEffect(load, [load]);
  useLiveRefresh(["bulk_bookings"], load);

  if (openId) {
    return (
      <BulkDetail
        id={openId}
        canManage={canManage}
        canReview={canReview}
        onBack={() => { setOpenId(null); load(); }}
        onEdit={(booking, members) => setEditing({ booking, members })}
        editing={editing}
        onEdited={() => { setEditing(null); }}
        onCloseEditor={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="page-stack animate-page">
      <PageHeader
        eyebrow="Travel"
        title="Bulk & group bookings"
        description={canManage ? "Group movements with a traveller list. Every traveller gets their own trip record." : "Group bookings that include your team. Review the group budget here."}
        actions={canManage ? <button type="button" className="button button-primary" onClick={() => setEditing({ booking: null, members: [] })}><Plus size={15} /> New bulk booking</button> : undefined}
      />
      <div className="panel table-panel">
        <div className="table-toolbar flex-wrap">
          <h2 className="section-heading">Bookings</h2>
          <div className="toolbar-filters flex flex-wrap gap-1" role="tablist" aria-label="Filter bulk bookings">
            {(["all", "pending_review", "cancelled"] as const).map((f) => (
              <button key={f} type="button" role="tab" aria-selected={filter === f} className={`button ${filter === f ? "button-primary" : "button-ghost"}`} onClick={() => setFilter(f)}>
                {{ all: "All", pending_review: "Awaiting review", cancelled: "Cancelled" }[f]}
              </button>
            ))}
          </div>
        </div>
        {error && <ErrorNotice message={error} onRetry={load} />}
        {list === null ? <Loading /> : list.length === 0 ? (
          <Empty title="No bulk bookings" description={canManage ? "Create one to book a group in one go." : "Group bookings with your team on them appear here."} />
        ) : (
          <div className="responsive-table">
            <table>
              <thead><tr><th>Booking</th><th>Route</th><th>Date</th><th className="text-right">Travellers</th><th className="text-right">Total</th><th>Status</th><th>Review</th></tr></thead>
              <tbody>
                {list.map((b) => (
                  <tr key={b.id} className="cursor-pointer" onClick={() => setOpenId(b.id)}>
                    <td>
                      <button type="button" className="font-semibold text-left hover:underline" onClick={(e) => { e.stopPropagation(); setOpenId(b.id); }}>{b.title}</button>
                      <div className="table-subline">{b.group_reference} · {labelFor(b.booking_type)}</div>
                    </td>
                    <td>{b.origin} → {b.destination}</td>
                    <td>{formatDate(b.departure_date)}</td>
                    <td className="text-right">{b.members?.[0]?.count ?? 0}</td>
                    <td className="text-right">{formatMoney(b.total_cost, b.currency)}</td>
                    <td><StatusPill status={b.status} /></td>
                    <td><span className={`approval-pill ${REVIEW_LABEL[b.review_status].tone}`}>{REVIEW_LABEL[b.review_status].label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && (
        <BulkEditor
          booking={editing.booking}
          members={editing.members}
          onClose={() => setEditing(null)}
          onSaved={(id) => { setEditing(null); setOpenId(id); }}
        />
      )}
    </div>
  );
}

function BulkDetail({ id, canManage, canReview, onBack, onEdit, editing, onEdited, onCloseEditor }: {
  id: string;
  canManage: boolean;
  canReview: boolean;
  onBack: () => void;
  onEdit: (booking: BulkBooking, members: BulkMember[]) => void;
  editing: { booking: BulkBooking | null; members: BulkMember[] } | null;
  onEdited: () => void;
  onCloseEditor: () => void;
}) {
  const [data, setData] = useState<{ booking: BulkBooking; members: BulkMember[] } | null>(null);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError("");
    getBulkBooking(id).then(setData).catch((err) => setError(err instanceof Error ? err.message : "Could not load the bulk booking."));
  }, [id]);
  useEffect(load, [load]);

  async function review(decision: "approved" | "noted") {
    setBusy(true);
    try {
      await reviewBulkBooking(id, decision, comment);
      toast.success(decision === "approved" ? "Group budget approved" : "Marked as noted");
      setComment("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the review.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    const reason = window.prompt("Cancel this bulk booking? Every traveller's trip will be cancelled. Reason (optional):");
    if (reason === null) return;
    setBusy(true);
    try {
      await cancelBulkBooking(id, reason);
      toast.success("Bulk booking cancelled");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel the bulk booking.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadTicket(m: BulkMember, file: File | undefined) {
    if (!file || !m.travel_record_id) return;
    try {
      await uploadDocument(m.employee_id, file, data?.booking.booking_type === "train" ? "train_ticket" : data?.booking.booking_type === "bus" ? "bus_ticket" : "flight_ticket", m.travel_record_id);
      toast.success(`Ticket added for ${m.profile?.full_name ?? "traveller"}`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The file could not be uploaded.");
    }
  }

  if (error) return <div className="page-stack"><button type="button" className="button button-ghost w-fit" onClick={onBack}><ArrowLeft size={15} /> Back</button><ErrorNotice message={error} onRetry={load} /></div>;
  if (!data) return <Loading />;
  const b = data.booking;
  const active = b.status !== "cancelled";
  const perHead = data.members.length && b.total_cost != null ? b.total_cost / data.members.length : null;

  return (
    <div className="page-stack animate-page">
      <button type="button" className="button button-ghost w-fit" onClick={onBack}><ArrowLeft size={15} /> All bulk bookings</button>
      <PageHeader
        eyebrow={`Bulk booking · ${b.group_reference}`}
        title={b.title}
        description={`${b.origin} → ${b.destination} · ${formatDate(b.departure_date)}${b.return_date ? ` to ${formatDate(b.return_date)}` : ""} · ${labelFor(b.booking_type)}${b.provider ? ` · ${b.provider}` : ""}`}
        actions={canManage && active ? (
          <>
            <button type="button" className="button button-ghost" onClick={() => onEdit(b, data.members)} disabled={busy}><Pencil size={14} /> Edit</button>
            <button type="button" className="button button-ghost" onClick={cancel} disabled={busy}><Ban size={14} /> Cancel booking</button>
          </>
        ) : undefined}
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="Travellers" value={String(data.members.length)} detail={canManage ? undefined : "Shown: people in your scope"} />
        <Stat label="Total cost" value={formatMoney(b.total_cost, b.currency)} detail={perHead != null && canManage ? `${formatMoney(perHead, b.currency)} per person` : undefined} />
        <Stat label="Savings" value={formatMoney(b.savings, b.currency)} />
        <Stat label="Status" value={active ? REVIEW_LABEL[b.review_status].label : "cancelled"} detail={b.reviewed_at ? `Reviewed ${formatDate(b.reviewed_at)}` : undefined} />
      </div>

      {(b.project || b.notes || b.review_comment) && (
        <div className="panel p-4 text-sm grid gap-1">
          {b.project && <span><strong>Project:</strong> {b.project}</span>}
          {b.review_comment && <span><strong>Reviewer:</strong> {b.review_comment}</span>}
          {b.notes && <span className="whitespace-pre-line"><strong>Notes:</strong> {b.notes}</span>}
        </div>
      )}

      {canReview && active && b.review_status === "pending_review" && (
        <div className="panel p-4 grid gap-3">
          <h2 className="section-heading">Review group budget</h2>
          <label className="field"><span>Comment (optional)</span><input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} /></label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="button button-primary" onClick={() => review("approved")} disabled={busy}><CheckCircle2 size={15} /> Approve budget</button>
            <button type="button" className="button button-ghost" onClick={() => review("noted")} disabled={busy}>Mark as noted</button>
          </div>
        </div>
      )}

      <div className="panel table-panel">
        <div className="table-toolbar"><h2 className="section-heading"><UsersRound size={16} className="inline mr-1" /> Travellers</h2></div>
        {data.members.length === 0 ? <Empty title="No travellers in your scope" description="Only travellers you are allowed to see are listed." /> : (
          <div className="responsive-table">
            <table>
              <thead><tr><th>Traveller</th><th>Seat / coach</th><th>PNR</th><th>Ticket</th><th className="text-right">Amount</th><th>Trip</th><th>Tickets</th></tr></thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.id}>
                    <td><Link className="font-semibold hover:underline" href={`/travel/employees/${m.employee_id}`}>{m.profile?.full_name ?? "—"}</Link><div className="table-subline">{m.profile?.employee_id} · {m.profile?.department ?? "—"}</div></td>
                    <td>{m.seat_or_coach ?? "—"}</td>
                    <td>{m.booking_reference ?? b.group_reference}</td>
                    <td>{m.ticket_number ?? "—"}</td>
                    <td className="text-right">{formatMoney(m.record?.amount ?? m.amount, b.currency)}</td>
                    <td>{m.record ? <StatusPill status={m.record.status} /> : "—"}</td>
                    <td className="whitespace-nowrap">
                      <span className="mr-2">{m.record?.documents?.[0]?.count ?? 0}</span>
                      {canManage && active && m.travel_record_id && (
                        <label className="button button-ghost cursor-pointer" aria-label={`Upload ticket for ${m.profile?.full_name ?? "traveller"}`}>
                          <FileUp size={14} /> Add
                          <input type="file" className="sr-only" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => { void uploadTicket(m, e.target.files?.[0]); e.target.value = ""; }} />
                        </label>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <BulkEditor
          booking={editing.booking}
          members={editing.members}
          onClose={onCloseEditor}
          onSaved={() => { onEdited(); load(); }}
        />
      )}
    </div>
  );
}

type Row = { key: string; employee_id?: string; employee_code?: string; label: string; seat_or_coach: string; booking_reference: string; ticket_number: string; amount: string };

function BulkEditor({ booking, members, onClose, onSaved }: {
  booking: BulkBooking | null;
  members: BulkMember[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [form, setForm] = useState<BulkBookingInput>(() => ({
    title: booking?.title ?? "",
    group_reference: booking?.group_reference ?? "",
    origin: booking?.origin ?? "",
    destination: booking?.destination ?? "",
    departure_date: booking?.departure_date ?? "",
    return_date: booking?.return_date ?? "",
    booking_type: booking?.booking_type ?? "flight",
    provider: booking?.provider ?? "",
    total_cost: booking?.total_cost != null ? String(booking.total_cost) : "",
    currency: booking?.currency ?? "INR",
    savings: booking?.savings != null ? String(booking.savings) : "",
    project: booking?.project ?? "",
    notes: booking?.notes ?? "",
  }));
  const [rows, setRows] = useState<Row[]>(() => members.map((m) => ({
    key: m.employee_id,
    employee_id: m.employee_id,
    label: `${m.profile?.full_name ?? ""} (${m.profile?.employee_id ?? ""})`,
    seat_or_coach: m.seat_or_coach ?? "",
    booking_reference: m.booking_reference ?? "",
    ticket_number: m.ticket_number ?? "",
    amount: m.amount != null ? String(m.amount) : "",
  })));
  const [paste, setPaste] = useState("");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<EmployeeSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!query.trim()) { setMatches([]); return; }
    const handle = setTimeout(() => listEmployees({ q: query, limit: 8 }).then((r) => setMatches(r.rows)).catch(() => setMatches([])), 250);
    return () => clearTimeout(handle);
  }, [query]);

  const set = (key: keyof BulkBookingInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setRow = (key: string, field: keyof Row) => (e: React.ChangeEvent<HTMLInputElement>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: e.target.value } : r)));

  function addCodes() {
    const codes = parseEmployeeCodes(paste);
    setRows((rs) => {
      const have = new Set(rs.map((r) => (r.employee_code ?? r.label).toUpperCase()));
      const added = codes.filter((c) => !have.has(c)).map((c) => ({ key: `code:${c}`, employee_code: c, label: c, seat_or_coach: "", booking_reference: "", ticket_number: "", amount: "" }));
      return [...rs, ...added].slice(0, MAX_TRAVELLERS);
    });
    setPaste("");
  }

  function addEmployee(m: EmployeeSummary) {
    setRows((rs) => rs.some((r) => r.employee_id === m.employee_id) ? rs : [...rs, { key: m.employee_id, employee_id: m.employee_id, label: `${m.employee_name} (${m.employee_code})`, seat_or_coach: "", booking_reference: "", ticket_number: "", amount: "" }]);
    setQuery("");
    setMatches([]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const memberInputs: BulkMemberInput[] = rows.map(({ employee_id, employee_code, seat_or_coach, booking_reference, ticket_number, amount }) => ({ employee_id, employee_code, seat_or_coach, booking_reference, ticket_number, amount }));
      const id = await saveBulkBooking(booking?.id ?? null, form, memberInputs);
      toast.success(booking ? "Bulk booking updated" : "Bulk booking created");
      onSaved(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the bulk booking.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="bulk-title">
      <form className="confirm-dialog w-full text-left max-h-[90vh] overflow-y-auto" style={{ maxWidth: "min(960px, 100%)" }} onSubmit={submit}>
        <button type="button" className="icon-button dialog-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <span className="card-kicker">BULK BOOKING</span>
        <h2 id="bulk-title">{booking ? "Edit bulk booking" : "New bulk booking"}</h2>
        {booking && <p className="text-xs opacity-70 mt-1">Changing the cost, date or destination sends it back for budget review. Travellers you remove have their trip cancelled.</p>}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-4">
          <label className="field sm:col-span-2"><span>Title</span><input value={form.title} onChange={set("title")} required maxLength={200} placeholder="Goa team offsite" /></label>
          <label className="field"><span>Group reference / PNR</span><input value={form.group_reference} onChange={set("group_reference")} required maxLength={64} /></label>
          <label className="field"><span>From</span><input value={form.origin} onChange={set("origin")} required maxLength={120} /></label>
          <label className="field"><span>To</span><input value={form.destination} onChange={set("destination")} required maxLength={120} /></label>
          <label className="field"><span>Mode</span>
            <select value={form.booking_type} onChange={set("booking_type")}>
              {["flight", "train", "bus", "cab", "hotel", "multi_modal", "other"].map((t) => <option key={t} value={t}>{labelFor(t)}</option>)}
            </select>
          </label>
          <label className="field"><span>Travel date</span><input type="date" value={form.departure_date} onChange={set("departure_date")} required /></label>
          <label className="field"><span>Return date</span><input type="date" value={form.return_date} onChange={set("return_date")} /></label>
          <label className="field"><span>Provider</span><input value={form.provider} onChange={set("provider")} maxLength={120} /></label>
          <label className="field"><span>Total cost</span><input type="number" min="0" step="0.01" inputMode="decimal" value={form.total_cost} onChange={set("total_cost")} /></label>
          <label className="field"><span>Savings</span><input type="number" min="0" step="0.01" inputMode="decimal" value={form.savings} onChange={set("savings")} /></label>
          <label className="field"><span>Project</span><input value={form.project} onChange={set("project")} maxLength={200} /></label>
          <label className="field sm:col-span-2 lg:col-span-3"><span>Notes</span><textarea value={form.notes} onChange={set("notes")} maxLength={4000} rows={2} /></label>
        </div>

        <h3 className="section-heading mt-5">Travellers ({rows.length})</h3>
        <div className="grid gap-3 sm:grid-cols-2 mt-2">
          <label className="field relative">
            <span>Add by name</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or employee ID" aria-autocomplete="list" />
            {matches.length > 0 && (
              <ul className="absolute z-10 left-0 right-0 top-full mt-1 panel p-1 max-h-56 overflow-y-auto" role="listbox">
                {matches.map((m) => (
                  <li key={m.employee_id}>
                    <button type="button" className="w-full text-left px-3 py-2 rounded hover:bg-black/5 text-sm" onClick={() => addEmployee(m)}>
                      <strong>{m.employee_name}</strong> <span className="opacity-60">{m.employee_code} · {m.department ?? "—"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </label>
          <label className="field">
            <span>Or paste employee IDs</span>
            <div className="flex gap-2">
              <input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="EMP001, EMP002, EMP003" />
              <button type="button" className="button button-ghost" onClick={addCodes} disabled={!paste.trim()}>Add</button>
            </div>
          </label>
        </div>

        {rows.length > 0 && (
          <div className="responsive-table mt-3">
            <table>
              <thead><tr><th>Traveller</th><th>Seat / coach</th><th>Own PNR</th><th>Ticket no.</th><th>Amount</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td className="max-w-[200px] truncate" title={r.label}>{r.label}</td>
                    <td><input className="w-24" value={r.seat_or_coach} onChange={setRow(r.key, "seat_or_coach")} maxLength={40} aria-label={`Seat for ${r.label}`} /></td>
                    <td><input className="w-28" value={r.booking_reference} onChange={setRow(r.key, "booking_reference")} maxLength={64} placeholder="group" aria-label={`PNR for ${r.label}`} /></td>
                    <td><input className="w-32" value={r.ticket_number} onChange={setRow(r.key, "ticket_number")} maxLength={64} aria-label={`Ticket for ${r.label}`} /></td>
                    <td><input className="w-24" type="number" min="0" step="0.01" value={r.amount} onChange={setRow(r.key, "amount")} placeholder="split" aria-label={`Amount for ${r.label}`} /></td>
                    <td><button type="button" className="icon-button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`Remove ${r.label}`}><X size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs opacity-70 mt-2">Leave Amount empty to split the total cost evenly. Leave PNR empty to use the group reference.</p>

        {error && <p className="text-sm text-red-600 mt-3" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={saving || rows.length === 0}>{saving ? "Saving…" : booking ? "Save changes" : "Create bulk booking"}</button>
        </div>
      </form>
    </div>
  );
}
