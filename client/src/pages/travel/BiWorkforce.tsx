import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Download, Search } from "lucide-react";
import {
  VERIFICATION_LABELS, WORKFORCE_TYPE_LABELS, applyToWorkers, listWorkers,
  type VerificationStatus, type WorkerFilters, type WorkerRow, type WorkforceType,
} from "../../lib/data/workforce";
import { exportToCsv } from "../../utils/exportCsv";
import { Kpi, count, dateRange, plural } from "./BiParts";
import WorkforceAnalyticsPanel from "./WorkforceAnalyticsPanel";
import { Empty, ErrorNotice, Loading, PageHeader, formatMoney } from "./common";

const PAGE = 200;
const STATUS_TONE: Record<VerificationStatus, string> = {
  verified: "approved",
  imported_unverified: "pending",
  possible_duplicate: "rejected",
  merged: "cancelled",
};

export function VerificationPill({ status }: { status: VerificationStatus }) {
  return <span className={`approval-pill ${STATUS_TONE[status] ?? "pending"}`}>{VERIFICATION_LABELS[status] ?? status}</span>;
}

/**
 * Temporary Workforce: temporary, contract and outsourced workers (and people
 * not yet classified) who travel for the company, with their recorded travel.
 * Figures come from the trips and cost lines on file; nothing is estimated.
 */
export default function BiWorkforce({ canManage }: { canManage: boolean }) {
  const [filters, setFilters] = useState<WorkerFilters>({ type: "non_permanent", sort: "spend" });
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<WorkerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [overview, setOverview] = useState<WorkerRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Bulk changes (Travel Desk and Director).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkType, setBulkType] = useState<WorkforceType>("permanent_employee");
  const [bulkVerify, setBulkVerify] = useState(true);
  const [bulkProgress, setBulkProgress] = useState<string>("");

  // The headline numbers always cover everyone who is not a permanent employee.
  const loadOverview = useCallback(() => {
    listWorkers({ type: "non_permanent", include_inactive: true }, 1000)
      .then((r) => setOverview(r.rows))
      .catch(() => setOverview([]));
  }, []);
  useEffect(() => loadOverview(), [loadOverview]);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    listWorkers(filters, PAGE, page * PAGE)
      .then((r) => { setRows(r.rows); setTotal(r.total); setSelected(new Set()); })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the workers."))
      .finally(() => setLoading(false));
  }, [filters, page]);
  useEffect(() => load(), [load]);

  const kpis = useMemo(() => {
    const list = overview ?? [];
    const byType = (t: WorkforceType) => list.filter((w) => w.workforce_type === t).length;
    const cur = list[0]?.currency ?? "INR";
    const net = list.reduce((s, w) => s + Number(w.net), 0);
    const travelling = list.filter((w) => w.trips > 0).length;
    return {
      cur, people: list.length, temp: byType("temporary_worker"), contract: byType("contract_worker"), outsourced: byType("outsourced_worker"),
      unknown: byType("unknown"),
      unverified: list.filter((w) => w.verification_status === "imported_unverified" || w.verification_status === "possible_duplicate").length,
      duplicates: list.filter((w) => w.verification_status === "possible_duplicate").length,
      withProject: list.filter((w) => w.project_id).length,
      withContractor: list.filter((w) => w.contractor_id).length,
      net, travelling,
      missing: list.reduce((s, w) => s + w.missing_cost_lines, 0),
    };
  }, [overview]);

  const set = (patch: Partial<WorkerFilters>) => { setPage(0); setFilters((f) => ({ ...f, ...patch })); };

  const selectable = canManage ? rows.filter((w) => !w.merged_into) : [];
  const allSelected = selectable.length > 0 && selectable.every((w) => selected.has(w.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function applyBulk() {
    const people = rows.filter((w) => selected.has(w.id));
    if (!people.length) return;
    const what = `${WORKFORCE_TYPE_LABELS[bulkType].toLowerCase()}${bulkVerify ? " and mark them verified" : ""}`;
    if (!window.confirm(`Set ${plural(people.length, "person", "people")} as ${what}? Each change is kept in the audit log and can be changed again on the person's page.`)) return;
    setBulkProgress(`0 of ${people.length}`);
    try {
      const r = await applyToWorkers(people, { workforce_type: bulkType, verify: bulkVerify }, undefined, (d, t) => setBulkProgress(`${d} of ${t}`));
      if (r.changed) toast.success(`${plural(r.changed, "person", "people")} updated`);
      if (r.failed.length) toast.error(`${plural(r.failed.length, "person", "people")} not changed: ${r.failed.slice(0, 3).map((f) => `${f.name} (${f.reason})`).join("; ")}${r.failed.length > 3 ? "…" : ""}`);
      if (!r.changed && !r.failed.length) toast.message("Nothing to change: they were already set.");
    } finally {
      setBulkProgress("");
      load();
      loadOverview();
    }
  }

  function download() {
    exportToCsv("temporary_workforce",
      ["Worker", "Code", "Kind of worker", "Status", "Contractor", "Project", "Trips", "Cancelled trips", "First travel", "Last travel",
       `Gross (${rows[0]?.currency ?? "INR"})`, "Credits", "Net", "Costs missing", "Trips in other currencies", "Active"],
      rows.map((w) => [w.full_name, w.employee_id, WORKFORCE_TYPE_LABELS[w.workforce_type], VERIFICATION_LABELS[w.verification_status],
        w.contractor_name ?? "", w.project_name ?? "", w.trips, w.cancelled_trips, w.first_trip ?? "", w.last_trip ?? "",
        w.gross, w.credits, w.net, w.missing_cost_lines, w.other_currency_trips, w.active ? "yes" : "no"]));
  }

  return (
    <div className="page-stack animate-page">
      <PageHeader
        eyebrow="BUSINESS INTELLIGENCE"
        title="Temporary Workforce"
        description="Temporary, contract and outsourced workers who travel for the company, and people from uploads who are not classified yet. Spend is the recorded travel cost on file; blank costs are counted as missing, never as zero."
        actions={<button type="button" className="button button-ghost" onClick={download} disabled={!rows.length}><Download size={14} /> Download CSV</button>}
      />

      {overview && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Kpi label="Workers (not permanent)" value={count(kpis.people)} detail={`${count(kpis.temp)} temporary · ${count(kpis.contract)} contract · ${count(kpis.outsourced)} outsourced`} />
          <Kpi label="Not classified yet" value={count(kpis.unknown)} detail="People from uploads whose kind of worker is unknown" tone={kpis.unknown ? "warn" : undefined} />
          <Kpi label="To verify" value={count(kpis.unverified)} detail={kpis.duplicates ? `${plural(kpis.duplicates, "possible duplicate")}` : "From uploads, not checked by a person yet"} tone={kpis.unverified ? "warn" : undefined} />
          <Kpi label="Recorded travel spend" value={formatMoney(kpis.net, kpis.cur)} detail={`${plural(kpis.travelling, "worker")} travelled${kpis.missing ? ` · ${plural(kpis.missing, "cost")} missing` : ""}`} />
        </div>
      )}
      {overview && overview.length > 0 && (
        <p className="text-xs opacity-70">{plural(kpis.withProject, "worker")} linked to a project · {plural(kpis.withContractor, "worker")} with a contractor. Projects and contractors are only ever set from the sheet or by a person, never guessed.</p>
      )}

      <WorkforceAnalyticsPanel />

      <div className="panel table-panel">
        <div className="table-toolbar flex-wrap gap-2">
          <form className="toolbar-filters relative" onSubmit={(e) => { e.preventDefault(); set({ q: query }); }}>
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-60" aria-hidden />
            <input type="search" className="pl-7" placeholder="Search name, code or other spelling" aria-label="Search workers" value={query} onChange={(e) => setQuery(e.target.value)} onBlur={() => set({ q: query })} />
          </form>
          <label className="toolbar-filters" style={{ flex: "0 0 auto" }}>
            <select aria-label="Kind of worker" value={filters.type ?? ""} onChange={(e) => set({ type: e.target.value as WorkerFilters["type"] })}>
              <option value="non_permanent">Everyone not permanent</option>
              {(Object.keys(WORKFORCE_TYPE_LABELS) as WorkforceType[]).map((t) => <option key={t} value={t}>{WORKFORCE_TYPE_LABELS[t]}</option>)}
              <option value="">Everyone</option>
            </select>
          </label>
          <label className="toolbar-filters" style={{ flex: "0 0 auto" }}>
            <select aria-label="Status" value={filters.status ?? ""} onChange={(e) => set({ status: e.target.value as WorkerFilters["status"] })}>
              <option value="">Any status</option>
              {(["imported_unverified", "possible_duplicate", "verified"] as VerificationStatus[]).map((s) => <option key={s} value={s}>{VERIFICATION_LABELS[s]}</option>)}
            </select>
          </label>
          <label className="toolbar-filters" style={{ flex: "0 0 auto" }}>
            <select aria-label="Sort by" value={filters.sort ?? "spend"} onChange={(e) => set({ sort: e.target.value as WorkerFilters["sort"] })}>
              <option value="spend">Highest spend</option><option value="trips">Most trips</option><option value="last_trip">Latest travel</option><option value="name">Name</option>
            </select>
          </label>
          <label className="text-xs flex items-center gap-2">
            <input type="checkbox" checked={!!filters.include_inactive} onChange={(e) => set({ include_inactive: e.target.checked })} /> Show inactive
          </label>
        </div>

        {canManage && selected.size > 0 && (
          <div className="table-toolbar flex-wrap gap-2" role="region" aria-label="Change selected people">
            <strong className="text-sm">{plural(selected.size, "person", "people")} selected</strong>
            <label className="toolbar-filters" style={{ flex: "0 0 auto" }}>
              <select aria-label="Kind of worker for the selected people" value={bulkType} onChange={(e) => setBulkType(e.target.value as WorkforceType)} disabled={!!bulkProgress}>
                {(Object.keys(WORKFORCE_TYPE_LABELS) as WorkforceType[]).map((t) => <option key={t} value={t}>Set as: {WORKFORCE_TYPE_LABELS[t]}</option>)}
              </select>
            </label>
            <label className="text-xs flex items-center gap-2">
              <input type="checkbox" checked={bulkVerify} onChange={(e) => setBulkVerify(e.target.checked)} disabled={!!bulkProgress} /> Also mark verified
            </label>
            <button type="button" className="button button-primary" onClick={() => void applyBulk()} disabled={!!bulkProgress}>{bulkProgress ? `Updating… ${bulkProgress}` : "Apply"}</button>
            <button type="button" className="button button-ghost" onClick={() => setSelected(new Set())} disabled={!!bulkProgress}>Clear</button>
          </div>
        )}
        {error && <ErrorNotice message={error} onRetry={load} />}
        {loading && !rows.length && <Loading label="Loading workers…" />}
        {!loading && !error && rows.length === 0 && (
          <Empty title="No workers match" description={filters.type === "non_permanent" && !filters.q ? "Workers appear here when an upload adds people who are not permanent employees." : "Clear some filters."} />
        )}
        {rows.length > 0 && (
          <div className={`responsive-table ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
            <table>
              <thead><tr>{canManage && <th><input type="checkbox" aria-label="Select everyone on this page" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((w) => w.id)))} /></th>}<th>Worker</th><th>Kind</th><th>Contractor</th><th>Project</th><th>Travel</th><th className="text-right">Trips</th><th className="text-right">Spend</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((w) => (
                  <tr key={w.id}>
                    {canManage && <td>{!w.merged_into && <input type="checkbox" aria-label={`Select ${w.full_name}`} checked={selected.has(w.id)} onChange={() => toggle(w.id)} />}</td>}
                    <td>
                      <Link href={`/travel/workforce/${w.id}`} className="font-semibold hover:underline">{w.full_name}</Link>
                      <div className="table-subline">{[w.employee_id, !w.active && "inactive", w.alias_count > 0 && plural(w.alias_count, "other spelling")].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="text-xs">{WORKFORCE_TYPE_LABELS[w.workforce_type]}</td>
                    <td className="text-xs">{w.contractor_name ?? <span className="opacity-60">Unknown</span>}</td>
                    <td className="text-xs">{w.project_name ?? <span className="opacity-60">Unassigned</span>}</td>
                    <td className="text-xs whitespace-nowrap">{dateRange(w.first_trip, w.last_trip)}</td>
                    <td className="text-right">{count(w.trips)}{w.cancelled_trips > 0 && <div className="table-subline">{w.cancelled_trips} cancelled</div>}</td>
                    <td className="text-right">
                      {formatMoney(w.net, w.currency)}
                      {Number(w.credits) < 0 && <div className="table-subline">{formatMoney(w.gross, w.currency)} less {formatMoney(-Number(w.credits), w.currency)} credits</div>}
                      {w.missing_cost_lines > 0 && <div className="table-subline">{plural(w.missing_cost_lines, "cost")} missing</div>}
                      {w.other_currency_trips > 0 && <div className="table-subline">+{plural(w.other_currency_trips, "trip")} in other currencies</div>}
                    </td>
                    <td><VerificationPill status={w.verification_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > PAGE && (
          <div className="dialog-actions">
            <span className="text-xs opacity-70 mr-auto">{count(page * PAGE + 1)}–{count(Math.min(total, (page + 1) * PAGE))} of {count(total)}</span>
            <button type="button" className="button button-ghost" disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <button type="button" className="button button-ghost" disabled={(page + 1) * PAGE >= total || loading} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
        {!canManage && rows.length > 0 && <p className="text-xs opacity-70 p-3">Only the Travel Desk or the Director can verify, classify or merge workers.</p>}
      </div>
    </div>
  );
}
