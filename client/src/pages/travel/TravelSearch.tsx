import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CalendarDays, Download, Filter, Plus, Search, UserRound, X } from "lucide-react";
import { exportToCsv } from "../../utils/exportCsv";
import { listEmployees, recordReportGenerated, searchTravelRecords, type EmployeeSummary, type TravelRecord } from "../../lib/data/travel";
import { parseDateQuery, type TravelFilters } from "../../lib/data/travelQuery";
import { Empty, ErrorNotice, Loading, PageHeader, Stat, StatusPill, formatDate, formatMoney, labelFor } from "./common";
import { TravelRecordDialog } from "./TravelRecordDialog";

const EMPTY: TravelFilters = { q: "", date: "", from: "", to: "", department: "", origin: "", destination: "", provider: "", bookingReference: "", ticketNumber: "", bookingType: "", status: "" };

/**
 * Search travel records by name, ID, date, range, place, department, PNR,
 * ticket, provider or status. Everyone uses the same page: an employee simply
 * gets back only their own trips, because the database enforces scope.
 */
export default function TravelSearch({ canManage, canSeeOthers }: { canManage: boolean; canSeeOthers: boolean }) {
  const [draft, setDraft] = useState<TravelFilters>(EMPTY);
  const [filters, setFilters] = useState<TravelFilters>(EMPTY);
  const [showMore, setShowMore] = useState(false);
  const [rows, setRows] = useState<TravelRecord[]>([]);
  const [count, setCount] = useState(0);
  const [people, setPeople] = useState<EmployeeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<TravelRecord | null | "new">(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const typedDate = parseDateQuery(filters.q);
      const [records, employees] = await Promise.all([
        searchTravelRecords(filters, { limit: 200 }),
        canSeeOthers && filters.q && !typedDate ? listEmployees({ q: filters.q, limit: 6 }) : Promise.resolve({ rows: [], count: 0 }),
      ]);
      setRows(records.rows);
      setCount(records.count);
      setPeople(employees.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not search travel records.");
    } finally {
      setLoading(false);
    }
  }, [filters, canSeeOthers]);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => {
    const active = rows.filter((r) => r.status !== "cancelled");
    return {
      spend: active.reduce((s, r) => s + (Number(r.amount) || 0), 0),
      people: new Set(active.map((r) => r.employee_id)).size,
    };
  }, [rows]);

  const typedDate = parseDateQuery(filters.q);
  const set = (key: keyof TravelFilters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft((d) => ({ ...d, [key]: e.target.value }));
  const apply = (e?: React.FormEvent) => { e?.preventDefault(); setFilters({ ...draft }); };
  const clear = () => { setDraft(EMPTY); setFilters(EMPTY); };

  function exportResults() {
    exportToCsv(
      "travel_search",
      ["Date", "Return", "Employee", "Employee ID", "Department", "From", "To", "Mode", "Provider", "PNR", "Ticket", "Amount", "Currency", "Status"],
      rows.map((r) => [r.departure_date, r.return_date, r.employee_name, r.employee_code, r.department, r.origin, r.destination, r.booking_type, r.airline_or_provider, r.booking_reference, r.ticket_number, r.amount, r.currency, r.status]),
    );
    void recordReportGenerated("travel_search").catch(() => undefined);
  }

  return (
    <div className="page-stack animate-page">
      <PageHeader
        eyebrow="TRAVEL"
        title={canSeeOthers ? "Travel search" : "My travel"}
        description={canSeeOthers ? "Search trips by person, date, place, PNR, ticket or provider. Try “Arun Kumar” or “14 October 2026”." : "Every trip booked for you, newest first."}
        actions={canManage ? <button type="button" className="button button-primary" onClick={() => setEditing("new")}><Plus size={16} /> Add trip</button> : undefined}
      />

      <form className="panel p-4 grid gap-3" onSubmit={apply} role="search">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="search-field flex-1 min-w-[220px] max-w-none">
            <Search size={16} />
            <input value={draft.q} onChange={set("q")} placeholder={canSeeOthers ? "Name, employee ID, PNR, ticket, place, or a date" : "Place, PNR, provider or a date"} aria-label="Search" maxLength={80} />
          </div>
          <button type="submit" className="button button-primary">Search</button>
          <button type="button" className="button button-ghost" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}><Filter size={14} /> Filters</button>
          {JSON.stringify(filters) !== JSON.stringify(EMPTY) && <button type="button" className="button button-ghost" onClick={clear}><X size={14} /> Clear</button>}
        </div>
        {showMore && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="field"><span>On date</span><input type="date" value={draft.date} onChange={set("date")} /></label>
            <label className="field"><span>From date</span><input type="date" value={draft.from} onChange={set("from")} disabled={!!draft.date} /></label>
            <label className="field"><span>To date</span><input type="date" value={draft.to} onChange={set("to")} disabled={!!draft.date} /></label>
            {canSeeOthers && <label className="field"><span>Department</span><input value={draft.department} onChange={set("department")} /></label>}
            <label className="field"><span>Origin</span><input value={draft.origin} onChange={set("origin")} /></label>
            <label className="field"><span>Destination</span><input value={draft.destination} onChange={set("destination")} /></label>
            <label className="field"><span>Provider</span><input value={draft.provider} onChange={set("provider")} /></label>
            <label className="field"><span>Booking reference</span><input value={draft.bookingReference} onChange={set("bookingReference")} /></label>
            <label className="field"><span>Ticket number</span><input value={draft.ticketNumber} onChange={set("ticketNumber")} /></label>
            <label className="field"><span>Mode</span>
              <select value={draft.bookingType} onChange={set("bookingType")}>
                <option value="">Any</option>
                {["flight", "train", "bus", "cab", "hotel", "multi_modal", "other"].map((t) => <option key={t} value={t}>{labelFor(t)}</option>)}
              </select>
            </label>
            <label className="field"><span>Status</span>
              <select value={draft.status} onChange={set("status")}>
                <option value="">Any</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
          </div>
        )}
        {typedDate && <p className="text-xs flex items-center gap-1"><CalendarDays size={13} /> Showing travel on {formatDate(typedDate)}</p>}
      </form>

      {people.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((p) => (
            <Link key={p.employee_id} href={`/travel/employees/${p.employee_id}`} className="panel p-4 block hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2"><UserRound size={16} /><strong>{p.employee_name}</strong></div>
              <div className="text-xs opacity-70 mt-1">{p.employee_code} · {p.department ?? "—"}</div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                <div><span className="opacity-60">Total trips</span><div className="font-semibold">{p.total_trips}</div></div>
                <div><span className="opacity-60">Total spend</span><div className="font-semibold">{formatMoney(p.total_spend)}</div></div>
                <div><span className="opacity-60">Last trip</span><div className="font-semibold">{formatDate(p.last_trip_date)}</div></div>
                <div><span className="opacity-60">Upcoming</span><div className="font-semibold">{p.upcoming_trips}{p.next_trip_date ? ` · next ${formatDate(p.next_trip_date)}` : ""}</div></div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        <Stat label="Trips found" value={String(count)} detail={count > rows.length ? `Showing first ${rows.length}` : undefined} />
        <Stat label="Spend (shown trips)" value={formatMoney(totals.spend)} />
        {canSeeOthers && <Stat label="People travelling" value={String(totals.people)} />}
      </div>

      {error && <ErrorNotice message={error} onRetry={load} />}

      <div className="panel table-panel">
        <div className="table-toolbar">
          <h2 className="section-heading">Results</h2>
          <button type="button" className="button button-ghost" onClick={exportResults} disabled={!rows.length}><Download size={14} /> Export CSV</button>
        </div>
        {loading ? <Loading /> : rows.length === 0 ? (
          <Empty title="No trips found" description="Try a different name, date or filter." />
        ) : (
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  {canSeeOthers && <th>Employee</th>}
                  <th>From → To</th>
                  <th>Provider</th>
                  <th>PNR / Ticket</th>
                  <th className="text-right">Amount</th>
                  <th>Status</th>
                  {canManage && <th><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.departure_date)}{r.return_date && <div className="table-subline">back {formatDate(r.return_date)}</div>}</td>
                    {canSeeOthers && (
                      <td>
                        <Link href={`/travel/employees/${r.employee_id}`} className="font-semibold hover:underline">{r.employee_name}</Link>
                        <div className="table-subline">{r.employee_code}{r.department ? ` · ${r.department}` : ""}</div>
                      </td>
                    )}
                    <td>{r.origin} → {r.destination}<div className="table-subline">{labelFor(r.booking_type)}</div></td>
                    <td>{r.airline_or_provider ?? "—"}</td>
                    <td>{r.booking_reference ?? "—"}<div className="table-subline">{r.ticket_number ?? ""}</div></td>
                    <td className="text-right">{formatMoney(r.amount, r.currency)}</td>
                    <td><StatusPill status={r.status} /></td>
                    {canManage && <td><button type="button" className="table-action" onClick={() => setEditing(r)}>Edit</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <TravelRecordDialog
          record={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
    </div>
  );
}
