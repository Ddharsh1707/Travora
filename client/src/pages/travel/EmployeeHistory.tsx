import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ChevronDown, ChevronRight, Download, FileSpreadsheet, MapPin, Plus } from "lucide-react";
import { exportWorkbook } from "../../utils/exportXlsx";
import { CATEGORY_LABELS } from "../../lib/data/expenses";
import { listSpendItems, summarizeSpend, type SpendItem } from "../../lib/data/spend";
import { exportToCsv } from "../../utils/exportCsv";
import { getEmployeeSummary, listAllRequests, recordReportGenerated, type EmployeeSummary, type TravelRecord, type TravelRequest } from "../../lib/data/travel";
import { fileTables, getEmployeeTrips, getUploadColumns, placesVisited, summarizeEmployeeSpend, type DetailedTrip, type UploadColumns } from "../../lib/data/employeeSpend";
import { useLiveRefresh } from "../../lib/data/reports";
import { Empty, ErrorNotice, Loading, PageHeader, Stat, StatusPill, formatDate, formatMoney, labelFor, routeLabel } from "./common";
import { RequestDecision, RequestStatusBadge } from "./RequestParts";
import { TravelRecordDialog } from "./TravelRecordDialog";
import { EmployeeLoginCard } from "./EmployeeLoginCard";
import { WorkbookViewer } from "./WorkbookViewer";

const CHARGE_LABEL: Record<string, string> = {
  fare: "Fares", addon: "Add-on charges", reissue: "Reissues", change_fee: "Change fees", cancellation_fee: "Cancellation fees",
  refund: "Refunds", hotel: "Hotel", cab: "Cab", visa: "Visa", forex: "Forex", other: "Other",
};
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" });

/**
 * One employee's full travel record: every trip with every column of the file
 * it came from, money worked out the same way as the reports, claims and
 * travel requests. The URL holds an employee id, but RLS decides what shows.
 */
export default function EmployeeHistory({ employeeId, canManage, showBack, canGiveLogin = false }: { employeeId: string; canManage: boolean; showBack: boolean; canGiveLogin?: boolean }) {
  const [summary, setSummary] = useState<EmployeeSummary | null>(null);
  const [trips, setTrips] = useState<DetailedTrip[]>([]);
  const [columns, setColumns] = useState<Record<string, UploadColumns>>({});
  const [claims, setClaims] = useState<SpendItem[]>([]);
  const [requests, setRequests] = useState<TravelRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TravelRecord | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<"trips" | "file">("trips");

  const load = useCallback(async () => {
    setError("");
    try {
      const [s, t, c, r] = await Promise.all([
        getEmployeeSummary(employeeId),
        getEmployeeTrips(employeeId),
        listSpendItems({ employee: employeeId, source: "claim" }).then((x) => x.rows).catch(() => [] as SpendItem[]),
        listAllRequests({ employeeId, status: "all", limit: 200 }).catch(() => [] as TravelRequest[]),
      ]);
      setSummary(s);
      setTrips(t);
      setClaims(c);
      setRequests(r);
      setColumns(canManage ? await getUploadColumns(t.map((x) => x.import_batch_id ?? "")) : {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load travel history.");
    } finally {
      setLoading(false);
    }
  }, [employeeId, canManage]);

  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(["travel_records", "travel_requests"], load);

  const money = useMemo(() => summarizeEmployeeSpend(trips), [trips]);
  const places = useMemo(() => placesVisited(trips), [trips]);
  const [allPlaces, setAllPlaces] = useState(false);
  const tables = useMemo(() => fileTables(trips, columns), [trips, columns]);
  const claimTotals = useMemo(() => summarizeSpend(claims), [claims]);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = trips.filter((t) => t.status !== "cancelled" && t.departure_date > today);
  const latestFirst = useMemo(() => [...trips].sort((a, b) => b.departure_date.localeCompare(a.departure_date)), [trips]);

  const asRecord = (t: DetailedTrip): TravelRecord => ({
    ...t, amount: t.amount === null ? null : Number(t.amount), status: t.status as TravelRecord["status"], booking_type: t.booking_type as TravelRecord["booking_type"],
    employee_code: summary?.employee_code ?? "", employee_name: summary?.employee_name ?? "", department: summary?.department ?? null,
  });

  function downloadCsv() {
    if (!summary) return;
    exportToCsv(
      `travel_report_${summary.employee_code}`,
      ["Employee", "Employee ID", "Department", "Date", "Return", "From", "To", "Mode", "Provider", "PNR", "Ticket", "Project", "Purpose", "Amount", "Currency", "Status"],
      trips.map((r) => [summary.employee_name, summary.employee_code, summary.department, r.departure_date, r.return_date, r.origin, r.destination, r.booking_type, r.airline_or_provider, r.booking_reference, r.ticket_number, r.project?.name ?? r.project_raw, r.purpose, r.amount, r.currency, r.status]),
    );
    void recordReportGenerated("employee_travel_history", employeeId).catch(() => undefined);
  }

  /** One Excel file: summary, breakdowns, every trip, every original file column, claims and requests. */
  async function downloadFullReport() {
    if (!summary) return;
    const category = (c: string) => CATEGORY_LABELS[c as keyof typeof CATEGORY_LABELS] ?? c.replace("_", " ");
    await exportWorkbook(`employee_report_${summary.employee_code}`, [
      {
        name: "Summary",
        headers: ["Field", "Value"],
        rows: [
          ["Employee", summary.employee_name], ["Employee ID", summary.employee_code],
          ["Department", summary.department], ["Designation", summary.designation],
          ["Status", summary.active ? "Current employee" : "Past employee"],
          ["Trips (not cancelled)", money.trips], ["Travel spend", money.spend],
          ["Of which add-ons, reissues and fees", money.extras], ["Refunds", money.refunds],
          ["Cancelled bookings", money.cancelledTrips], ["Value of cancelled bookings", money.cancelledValue],
          ["Total in the files (spend + cancelled)", money.inFile], ["Trips without a cost", money.withoutCost],
          ["First trip", money.firstTrip], ["Last trip", money.lastTrip],
          ["Expense claims", claims.length], ["Claims counted (waiting, approved, paid)", claimTotals.claims],
          ["Total spend (travel + claims)", money.spend + claimTotals.claims],
          ["Travel requests", requests.length],
          ["Report date", new Date().toISOString().slice(0, 10)],
        ],
      },
      { name: "By mode", headers: ["Mode", "Trips", "Spend"], rows: money.byMode.map((m) => [labelFor(m.key), m.trips, m.spend]) },
      { name: "By month", headers: ["Month", "Trips", "Spend"], rows: money.byMonth.map((m) => [m.key, m.trips, m.spend]) },
      { name: "Places visited", headers: ["Place", "Visits", "First visit", "Last visit", "Modes", "Spend"], rows: places.map((p) => [p.place, p.visits, p.first, p.last, p.modes.map(labelFor).join(", "), p.spend]) },
      { name: "By project", headers: ["Project", "Trips", "Spend"], rows: money.byProject.map((m) => [m.key, m.trips, m.spend]) },
      {
        name: "Trips",
        headers: ["Date", "Return", "From", "To", "Route", "Mode", "Provider", "PNR", "Ticket", "Project", "Purpose", "Booked on", "Payment", "Amount", "Currency", "Status", "File sheet", "File row"],
        rows: trips.map((r) => [r.departure_date, r.return_date, r.origin, r.destination, r.route, r.booking_type, r.airline_or_provider,
          r.booking_reference, r.ticket_number, r.project?.name ?? r.project_raw, r.purpose, r.booking_date, r.payment_mode,
          r.amount === null ? null : Number(r.amount), r.currency, r.status, r.source_sheet, r.source_row]),
      },
      ...tables.map((tb, i) => ({
        name: `File ${i + 1} ${tb.title}`.replace(/[\\/?*[\]:]/g, " ").slice(0, 31),
        headers: tb.headers,
        rows: tb.rows.map((r) => tb.headers.map((h) => r.extra?.[h] ?? null)),
      })),
      {
        name: "Expense claims",
        headers: ["Date", "Category", "Description", "Project", "From", "To", "Amount", "Currency", "Status", "Entered by"],
        rows: claims.map((c) => [c.spend_date, category(c.category), c.description, c.project_name, c.origin, c.destination,
          c.amount === null ? null : Number(c.amount), c.currency, c.status, c.entered_by]),
      },
      {
        name: "Travel requests",
        headers: ["Sent", "From", "To", "Travel date", "Return", "Mode", "Project", "Purpose", "Estimate", "Status", "Decided by", "Decided on", "Comment"],
        rows: requests.map((r) => [r.created_at.slice(0, 10), r.origin, r.destination, r.departure_date, r.return_date, r.travel_type, r.project_name,
          r.purpose, r.estimated_cost, r.status, r.decided_by_name ? `${r.decided_by_name} (${r.decided_by_role ?? ""})` : null, r.decided_at?.slice(0, 10) ?? null, r.decision_comment]),
      },
    ]);
    void recordReportGenerated("employee_travel_history", employeeId).catch(() => undefined);
  }

  if (loading) return <div className="page-stack"><Loading label="Loading travel history…" /></div>;
  if (error) return <div className="page-stack"><ErrorNotice message={error} onRetry={load} /></div>;
  if (!summary) {
    return (
      <div className="page-stack">
        <Empty title="Employee not found" description="This employee does not exist or is outside what you are allowed to see." />
      </div>
    );
  }

  const breakdown = (title: string, rows: Array<{ key: string; trips: number; spend: number }>, label: (k: string) => string = (k) => k) => (
    <section className="panel p-4 min-w-0">
      <span className="card-kicker">{title}</span>
      {rows.length === 0 ? <p className="text-sm opacity-70 mt-2">Nothing yet.</p> : (
        <ul className="mt-2 grid gap-1 text-sm">
          {rows.map((r) => {
            const pct = money.spend > 0 ? Math.round((r.spend / money.spend) * 100) : 0;
            return (
              <li key={r.key} className="grid gap-0.5">
                <div className="flex gap-2"><span className="truncate flex-1" title={label(r.key)}>{label(r.key)}</span><span className="opacity-60 text-xs">{r.trips} trip{r.trips === 1 ? "" : "s"}</span><span className="font-semibold w-24 text-right">{formatMoney(r.spend)}</span></div>
                <div className="h-1 rounded" style={{ background: "var(--line)" }}><div className="h-1 rounded" style={{ width: `${pct}%`, background: "#1D4E89" }} /></div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <div className="page-stack animate-page">
      {showBack && <Link href="/travel/employees" className="text-xs inline-flex items-center gap-1 hover:underline"><ArrowLeft size={13} /> All employees</Link>}
      <PageHeader
        eyebrow={summary?.active === false ? "PAST EMPLOYEE" : "EMPLOYEE RECORD"}
        title={summary.employee_name}
        description={`Employee ID ${summary.employee_code} · ${summary.department ?? "No department"}${summary.designation ? ` · ${summary.designation}` : ""}`}
        actions={
          <>
            <button type="button" className="button button-primary" onClick={() => void downloadFullReport()}><FileSpreadsheet size={14} /> Download report (Excel)</button>
            <button type="button" className="button button-ghost" onClick={downloadCsv} disabled={!trips.length}><Download size={14} /> Trips CSV</button>
            {canManage && <button type="button" className="button button-ghost" onClick={() => setAdding(true)}><Plus size={16} /> Add trip</button>}
          </>
        }
      />

      {canGiveLogin && <EmployeeLoginCard profileId={employeeId} />}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="Trips" value={String(money.trips)} detail={money.firstTrip ? `${formatDate(money.firstTrip)} to ${formatDate(money.lastTrip)}` : "None yet"} />
        <Stat label="Travel spend" value={formatMoney(money.spend)} detail={money.withoutCost ? `${money.withoutCost} trip(s) have no cost in the file` : "Cancelled bookings not included"} />
        <Stat label="Cancelled bookings" value={formatMoney(money.cancelledValue)} detail={`${money.cancelledTrips} cancelled · file total ${formatMoney(money.inFile)}`} />
        <Stat label="Total spent" value={formatMoney(money.spend + claimTotals.claims)} detail={`Travel + ${formatMoney(claimTotals.claims)} in claims`} />
      </div>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="Add-ons, reissues, fees" value={formatMoney(money.extras)} detail="Included in travel spend" />
        <Stat label="Refunds" value={formatMoney(money.refunds)} detail="Already taken off spend" />
        <Stat label="Upcoming trips" value={String(upcoming.length)} detail={upcoming[0] ? `Next on ${formatDate(upcoming[0].departure_date)}` : undefined} />
        <Stat label="Travel requests" value={String(requests.length)} detail={`${requests.filter((r) => r.status === "pending").length} waiting`} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {breakdown("Spend by mode", money.byMode, labelFor)}
        {breakdown("Spend by month", money.byMonth, monthLabel)}
        {breakdown("Spend by project", money.byProject)}
      </div>

      {money.byCharge.length > 0 && (
        <div className="panel p-4 flex flex-wrap gap-2 items-center text-sm">
          <span className="card-kicker mr-2">Charges in the files</span>
          {money.byCharge.map((c) => <span key={c.key} className="meta-chip">{CHARGE_LABEL[c.key] ?? c.key}: {c.lines} · {formatMoney(c.amount)}</span>)}
          {money.byDestination.length > 0 && <span className="text-xs opacity-70 ml-auto">Most visited: {money.byDestination.slice(0, 3).map((d) => d.key).join(", ")}</span>}
        </div>
      )}

      {places.length > 0 && (
        <section className="panel p-4 grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <MapPin size={16} />
            <h2 className="section-heading m-0">Everywhere {summary.employee_name.split(" ")[0]} went</h2>
            <span className="text-xs opacity-70">{places.length} place{places.length === 1 ? "" : "s"} · {money.trips} trip{money.trips === 1 ? "" : "s"}{money.firstTrip ? ` from ${formatDate(money.firstTrip)} to ${formatDate(money.lastTrip)}` : ""}</span>
          </div>
          <div className="responsive-table">
            <table>
              <thead><tr><th>Place</th><th className="text-right">Visits</th><th>First visit</th><th>Last visit</th><th>How</th><th className="text-right">Spend</th></tr></thead>
              <tbody>
                {(allPlaces ? places : places.slice(0, 12)).map((p) => (
                  <tr key={p.place}>
                    <td className="font-semibold">{p.place}</td>
                    <td className="text-right">{p.visits}</td>
                    <td>{formatDate(p.first)}</td>
                    <td>{formatDate(p.last)}</td>
                    <td>{p.modes.map(labelFor).join(", ")}</td>
                    <td className="text-right">{p.spend ? formatMoney(p.spend) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {places.length > 12 && <button type="button" className="button button-ghost justify-self-start" onClick={() => setAllPlaces(!allPlaces)}>{allPlaces ? "Show fewer" : `Show all ${places.length} places`}</button>}
        </section>
      )}

      <div className="panel table-panel">
        <div className="table-toolbar flex flex-wrap items-center gap-2">
          <h2 className="section-heading">Travel history</h2>
          {tables.length > 0 && (
            <div className="ml-auto flex gap-2">
              <button type="button" className={`button ${view === "trips" ? "button-primary" : "button-ghost"}`} onClick={() => setView("trips")}>Trips</button>
              <button type="button" className={`button ${view === "file" ? "button-primary" : "button-ghost"}`} onClick={() => setView("file")}>As in the Excel / PDF</button>
            </div>
          )}
        </div>
        {trips.length === 0 ? <Empty title="No trips yet" description="Trips appear here as soon as they are booked or uploaded." /> : view === "trips" ? (
          <div className="responsive-table">
            <table>
              <thead><tr><th><span className="sr-only">Details</span></th><th>Date</th><th>Route</th><th>Provider / PNR</th><th>Project</th><th className="text-right">Amount</th><th>Status</th>{canManage && <th><span className="sr-only">Actions</span></th>}</tr></thead>
              <tbody>
                {latestFirst.map((r) => {
                  const isOpen = !!open[r.id];
                  const extra = Object.entries(r.extra ?? {});
                  return (
                    <Fragment key={r.id}>
                      <tr>
                        <td><button type="button" className="icon-button" aria-expanded={isOpen} aria-label={isOpen ? "Hide details" : "Show every detail"} onClick={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))}>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button></td>
                        <td>{formatDate(r.departure_date)}{r.return_date && <div className="table-subline">back {formatDate(r.return_date)}</div>}</td>
                        <td>{routeLabel(r.origin, r.destination)}<div className="table-subline">{labelFor(r.booking_type)}{r.route && r.route !== `${r.origin}-${r.destination}` ? ` · ${r.route}` : ""}</div></td>
                        <td>{r.airline_or_provider ?? "—"}<div className="table-subline">{r.booking_reference ?? ""}{r.ticket_number ? ` · ${r.ticket_number}` : ""}</div></td>
                        <td className="max-w-[200px] truncate" title={r.purpose ?? ""}>{r.project?.name ?? r.project_raw ?? "—"}<div className="table-subline truncate">{r.purpose ?? ""}</div></td>
                        <td className="text-right">{formatMoney(r.amount, r.currency)}{(r.cost_lines?.length ?? 0) > 1 && <div className="table-subline">{r.cost_lines?.length} charges</div>}</td>
                        <td><StatusPill status={r.status} /></td>
                        {canManage && <td><button type="button" className="table-action" onClick={() => setEditing(asRecord(r))}>Edit</button></td>}
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={canManage ? 8 : 7} style={{ background: "var(--surface-muted, transparent)" }}>
                            <div className="grid gap-3 md:grid-cols-2 text-xs p-2">
                              <div>
                                <div className="card-kicker mb-1">Every detail from the file</div>
                                {extra.length === 0 ? <p className="opacity-70">Entered by hand{r.source === "bulk_booking" ? " (bulk booking)" : ""}, not from a file.</p> : (
                                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                                    {extra.map(([k, v]) => <Fragment key={k}><dt className="opacity-60">{k}</dt><dd className="break-words">{v}</dd></Fragment>)}
                                  </dl>
                                )}
                                {r.source_sheet && <p className="opacity-60 mt-1">From {columns[r.import_batch_id ?? ""]?.filename ? `${columns[r.import_batch_id ?? ""].filename}, ` : ""}sheet “{r.source_sheet}”, row {r.source_row}</p>}
                              </div>
                              <div>
                                <div className="card-kicker mb-1">Charges</div>
                                {(r.cost_lines ?? []).length === 0 ? <p className="opacity-70">{formatMoney(r.amount, r.currency)} in total.</p> : (
                                  <ul className="grid gap-0.5">
                                    {(r.cost_lines ?? []).map((l, i) => (
                                      <li key={i} className="flex gap-2"><span className="flex-1">{CHARGE_LABEL[l.line_type] ?? l.line_type}{l.source_row ? ` (row ${l.source_row})` : ""}</span><span>{l.amount === null ? (l.amount_state === "included_in_group" ? "shared with group" : "no cost") : formatMoney(l.amount, r.currency)}</span></li>
                                    ))}
                                  </ul>
                                )}
                                {(r.notes ?? []).length > 0 && <p className="mt-2 opacity-80">Notes: {(r.notes ?? []).join("; ")}</p>}
                                {(r.booking_date || r.payment_mode || r.consultant || r.approved_by_text) && (
                                  <p className="mt-2 opacity-80">{[r.booking_date && `Booked ${formatDate(r.booking_date)}`, r.payment_mode && `Paid by ${r.payment_mode}`, r.consultant && `Consultant ${r.consultant}`, r.approved_by_text && `Approved by ${r.approved_by_text}`].filter(Boolean).join(" · ")}</p>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-2">
            <WorkbookViewer
              sheets={tables.map((tb) => ({ name: tb.title.slice(0, 60), merges: [], rows: [tb.headers, ...tb.rows.map((r) => tb.headers.map((h) => r.extra?.[h] ?? null))] }))}
              note="Only this employee's rows, with every column from the uploaded file."
            />
          </div>
        )}
      </div>

      {requests.length > 0 && (
        <div className="panel p-4 grid gap-3">
          <h2 className="section-heading">Travel requests</h2>
          {requests.slice(0, 20).map((r) => (
            <div key={r.id} className="border-t pt-2 grid gap-1" style={{ borderColor: "var(--line)" }}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <strong>{r.origin} → {r.destination}</strong>
                <span className="opacity-70 text-xs">{formatDate(r.departure_date)} · {labelFor(r.travel_type)}{r.project_name ? ` · ${r.project_name}` : ""}</span>
                <span className="ml-auto"><RequestStatusBadge status={r.status} /></span>
              </div>
              <div className="text-xs opacity-80">{r.purpose}</div>
              <RequestDecision r={r} forEmployee={false} />
            </div>
          ))}
          {requests.length > 20 && <Link href="/travel/approvals" className="text-xs underline">See all travel requests</Link>}
        </div>
      )}

      {claims.length > 0 && (
        <div className="panel table-panel">
          <div className="table-toolbar"><h2 className="section-heading">Expense claims</h2></div>
          <div className="responsive-table">
            <table>
              <thead><tr><th>Date</th><th>What for</th><th>Project</th><th className="text-right">Amount</th><th>Status</th></tr></thead>
              <tbody>
                {claims.map((c) => (
                  <tr key={c.id} className={Number(c.counted) === 0 ? "opacity-60" : ""}>
                    <td>{formatDate(c.spend_date)}</td>
                    <td>{c.description || c.category}<div className="table-subline">{CATEGORY_LABELS[c.category as keyof typeof CATEGORY_LABELS] ?? c.category} · {c.entered_by}</div></td>
                    <td>{c.project_name ?? "—"}</td>
                    <td className="text-right">{c.amount === null ? "—" : formatMoney(c.amount, c.currency)}</td>
                    <td>{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(adding || editing) && (
        <TravelRecordDialog
          record={editing}
          presetEmployee={{ id: summary.employee_id, name: summary.employee_name, code: summary.employee_code }}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); void load(); }}
        />
      )}
    </div>
  );
}
