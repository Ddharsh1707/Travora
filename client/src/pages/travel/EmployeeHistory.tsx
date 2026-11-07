import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Download, FileSpreadsheet, Plus } from "lucide-react";
import { exportWorkbook } from "../../utils/exportXlsx";
import { CATEGORY_LABELS } from "../../lib/data/expenses";
import { listSpendItems, summarizeSpend, type SpendItem } from "../../lib/data/spend";
import { exportToCsv } from "../../utils/exportCsv";
import { getEmployeeHistory, getEmployeeSummary, recordReportGenerated, type EmployeeSummary, type TravelRecord } from "../../lib/data/travel";
import { summarizeRecords } from "../../lib/data/travelQuery";
import { Empty, ErrorNotice, Loading, PageHeader, Stat, StatusPill, formatDate, formatMoney, labelFor } from "./common";
import { TravelRecordDialog } from "./TravelRecordDialog";

/**
 * One employee's travel history. The URL holds an employee id, but changing it
 * does not widen access: if RLS hides that employee, this page shows
 * "not found" because the database returns nothing.
 */
export default function EmployeeHistory({ employeeId, canManage, showBack }: { employeeId: string; canManage: boolean; showBack: boolean }) {
  const [summary, setSummary] = useState<EmployeeSummary | null>(null);
  const [rows, setRows] = useState<TravelRecord[]>([]);
  const [claims, setClaims] = useState<SpendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TravelRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, h, c] = await Promise.all([
        getEmployeeSummary(employeeId),
        getEmployeeHistory(employeeId),
        listSpendItems({ employee: employeeId, source: "claim" }).then((r) => r.rows).catch(() => [] as SpendItem[]),
      ]);
      setSummary(s);
      setRows(h);
      setClaims(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load travel history.");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => { void load(); }, [load]);

  const stats = useMemo(() => summarizeRecords(rows), [rows]);

  function downloadReport() {
    if (!summary) return;
    exportToCsv(
      `travel_report_${summary.employee_code}`,
      ["Employee", "Employee ID", "Department", "Date", "Return", "From", "To", "Mode", "Provider", "PNR", "Ticket", "Amount", "Currency", "Status"],
      rows.map((r) => [summary.employee_name, summary.employee_code, summary.department, r.departure_date, r.return_date, r.origin, r.destination, r.booking_type, r.airline_or_provider, r.booking_reference, r.ticket_number, r.amount, r.currency, r.status]),
    );
    void recordReportGenerated("employee_travel_history", employeeId).catch(() => undefined);
  }

  /** One Excel file: a summary sheet, every trip and every expense claim. */
  async function downloadFullReport() {
    if (!summary) return;
    const claimTotals = summarizeSpend(claims);
    const category = (c: string) => CATEGORY_LABELS[c as keyof typeof CATEGORY_LABELS] ?? c.replace("_", " ");
    await exportWorkbook(`employee_report_${summary.employee_code}`, [
      {
        name: "Summary",
        headers: ["Field", "Value"],
        rows: [
          ["Employee", summary.employee_name], ["Employee ID", summary.employee_code],
          ["Department", summary.department], ["Designation", summary.designation],
          ["Status", summary.active ? "Current employee" : "Past employee"],
          ["Trips", stats.totalTrips], ["Travel spend", stats.totalSpend],
          ["Last trip", stats.lastTrip], ["Expense claims", claims.length],
          ["Claims counted (waiting, approved, paid)", claimTotals.claims],
          ["Total spend (trips + claims)", stats.totalSpend + claimTotals.claims],
          ["Report date", new Date().toISOString().slice(0, 10)],
        ],
      },
      {
        name: "Trips",
        headers: ["Date", "Return", "From", "To", "Mode", "Provider", "PNR", "Ticket", "Amount", "Currency", "Status"],
        rows: rows.map((r) => [r.departure_date, r.return_date, r.origin, r.destination, r.booking_type, r.airline_or_provider,
          r.booking_reference, r.ticket_number, r.amount === null ? null : Number(r.amount), r.currency, r.status]),
      },
      {
        name: "Expense claims",
        headers: ["Date", "Category", "Description", "Project", "From", "To", "Amount", "Currency", "Status", "Entered by"],
        rows: claims.map((c) => [c.spend_date, category(c.category), c.description, c.project_name, c.origin, c.destination,
          c.amount === null ? null : Number(c.amount), c.currency, c.status, c.entered_by]),
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
            <button type="button" className="button button-ghost" onClick={downloadReport} disabled={!rows.length}><Download size={14} /> Trips CSV</button>
            {canManage && <button type="button" className="button button-ghost" onClick={() => setAdding(true)}><Plus size={16} /> Add trip</button>}
          </>
        }
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="Total trips" value={String(stats.totalTrips)} />
        <Stat label="Total travel spend" value={formatMoney(stats.totalSpend)} />
        <Stat label="Last trip" value={formatDate(stats.lastTrip)} />
        <Stat label="Upcoming trips" value={String(stats.upcomingTrips)} detail={stats.nextTrip ? `Next on ${formatDate(stats.nextTrip)}` : undefined} />
      </div>

      <div className="panel table-panel">
        <div className="table-toolbar"><h2 className="section-heading">History</h2></div>
        {rows.length === 0 ? <Empty title="No trips yet" description="Trips will appear here as soon as they are booked or imported." /> : (
          <div className="responsive-table">
            <table>
              <thead><tr><th>Date</th><th>From</th><th>To</th><th>Provider</th><th>PNR</th><th className="text-right">Amount</th><th>Status</th>{canManage && <th><span className="sr-only">Actions</span></th>}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.departure_date)}<div className="table-subline">{labelFor(r.booking_type)}</div></td>
                    <td>{r.origin ?? "—"}</td>
                    <td>{r.destination}</td>
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
