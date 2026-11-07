import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, Pencil, Search, X } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "wouter";
import {
  KIND_LABEL, STATUS_LABEL, assignTripProject, fillMonthGaps, getFilterOptions, getProjectDetail, updateProject, useBiFilters,
  type FilterOptions, type Project, type ProjectDetail, type ProjectKind, type ProjectStatus,
} from "../../lib/data/bi";
import { monthLabel } from "../../lib/data/reports";
import { recordReportGenerated } from "../../lib/data/travel";
import { exportToCsv } from "../../utils/exportCsv";
import BiFilterBar from "./BiFilterBar";
import { BI_PALETTE, CostCell, DataQuality, Kpi, Panel, ShareBar, compact, count, dateRange, plural } from "./BiParts";
import { ProjectStatusPill } from "./BiProjects";
import { Empty, ErrorNotice, Loading, PageHeader, formatDate, formatMoney, labelFor, routeLabel } from "./common";

/**
 * One project (or the bookings linked to no project): who travelled, where,
 * when, and every booking behind the totals. The CEO can fill in project
 * details that are not in the sheets and link bookings by hand.
 */
export default function BiProjectDetail({ projectId, isCeo }: { projectId: string | null; isCeo: boolean }) {
  const [filters, setFilters] = useBiFilters();
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [rowError, setRowError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    getProjectDetail(projectId, filters)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the project."))
      .finally(() => setLoading(false));
  }, [projectId, filters]);
  useEffect(() => load(), [load]);
  useEffect(() => { if (isCeo) getFilterOptions().then(setOptions).catch(() => undefined); }, [isCeo]);

  const cur = data?.base_currency ?? "INR";
  const months = useMemo(() => fillMonthGaps(data?.monthly ?? []).map((m) => ({ ...m, label: monthLabel(m.month) })), [data]);
  const ledger = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = data?.ledger ?? [];
    if (!q) return all;
    return all.filter((r) => `${r.full_name} ${r.employee_code} ${r.origin ?? ""} ${r.destination ?? ""} ${r.booking_reference ?? ""} ${r.provider ?? ""} ${r.project_raw ?? ""} ${r.purpose ?? ""}`.toLowerCase().includes(q));
  }, [data, query]);

  const p = data?.project ?? null;
  const title = projectId ? p?.name ?? "Project" : "Travel not linked to a project";

  async function assign(tripId: string, target: string) {
    setRowError("");
    try {
      await assignTripProject(tripId, target || null);
      load();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Could not change the project.");
    }
  }

  function download() {
    if (!data) return;
    exportToCsv(`project_${title.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
      ["Travel date", "Return date", "Employee ID", "Employee", "Type", "From", "To", "Provider", "PNR / reference", "Status",
        "Project in sheet", "Purpose", "Cost", "Currency", "Cost status", "Cost lines", "Sheet"],
      ledger.map((r) => [r.departure_date, r.return_date ?? "", r.employee_code, r.full_name, labelFor(r.category), r.origin ?? "", r.destination ?? "",
        r.provider ?? "", r.booking_reference ?? "", r.status, r.project_raw ?? "", r.purpose ?? "", r.amount ?? "", r.currency, r.cost_state, r.cost_lines, r.source_sheet ?? ""]));
    void recordReportGenerated("project_detail").catch(() => undefined);
  }

  const details = p ? [p.code && `Code ${p.code}`, p.client && `Client: ${p.client}`, p.site && `Site: ${p.site}`, p.country, p.start_date && `Started ${formatDate(p.start_date)}`, p.end_date && `Ended ${formatDate(p.end_date)}`].filter(Boolean).join(" · ") : "";

  return (
    <div className="page-stack animate-page">
      <Link href="/travel/bi/projects" className="text-xs inline-flex items-center gap-1 hover:underline"><ArrowLeft size={13} /> Project Intelligence</Link>
      <PageHeader
        eyebrow={p ? KIND_LABEL[p.kind].toUpperCase() : "PROJECT INTELLIGENCE"}
        title={title}
        description={projectId
          ? details || (isCeo ? "No client, site or dates recorded yet. Use Edit details to add them." : "No client, site or dates recorded yet.")
          : "Bookings whose sheet had no project name, or a name that is not linked to a project yet."}
        actions={<>
          {p && <ProjectStatusPill status={p.status} />}
          {p && isCeo && <button type="button" className="button button-ghost" onClick={() => setEditing(true)}><Pencil size={14} /> Edit details</button>}
          <button type="button" className="button button-ghost" onClick={download} disabled={!data?.ledger.length}><Download size={14} /> Download CSV</button>
        </>}
      />
      {data && data.aliases.length > 0 && (
        <p className="text-xs opacity-80">Spellings in the travel sheets linked to this project: {data.aliases.map((a) => <span key={a} className="bi-tag mr-1">{a}</span>)}</p>
      )}
      <BiFilterBar filters={filters} onChange={setFilters} hide={["project"]} />
      {error && <ErrorNotice message={error} onRetry={load} />}
      {loading && !data && <Loading label="Loading the project…" />}

      {data && (data.kpis.bookings === 0 ? (
        <Empty title="No travel for this project" description="No bookings match these filters." />
      ) : (
        <div className={`page-stack ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Kpi label="Travel spend" value={formatMoney(data.kpis.spend, cur)} detail={data.kpis.costed_bookings ? `${formatMoney(data.kpis.spend / data.kpis.costed_bookings, cur)} per costed booking` : "No costs recorded"} />
            <Kpi label="Bookings" value={count(data.kpis.bookings)} detail={dateRange(data.kpis.first_date, data.kpis.last_date)} />
            <Kpi label="Travellers" value={count(data.kpis.travellers)} />
            <Kpi label="Places" value={count(data.kpis.places)} detail="Distinct destinations" />
          </div>
          <DataQuality kpis={data.kpis} currency={cur} others={data.other_currencies} />

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Travel by month" note={`Spend in ${cur} (bars), bookings (line)`} className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={months} margin={{ left: 0, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--ink-soft)" }} />
                  <YAxis yAxisId="s" tick={{ fontSize: 11, fill: "var(--ink-soft)" }} tickFormatter={(v: number) => compact.format(v)} width={48} />
                  <YAxis yAxisId="b" orientation="right" tick={{ fontSize: 11, fill: "var(--ink-soft)" }} width={32} allowDecimals={false} />
                  <Tooltip formatter={(v: number, name: string) => (name === "Spend" ? formatMoney(v, cur) : count(v))} />
                  <Bar yAxisId="s" dataKey="spend" name="Spend" fill="var(--saffron)" radius={[4, 4, 0, 0]} maxBarSize={56} />
                  <Line yAxisId="b" dataKey="bookings" name="Bookings" stroke="var(--blue)" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </Panel>
            <Panel title="By travel type">
              <ul className="grid gap-3 mt-2">
                {data.categories.map((c, i) => (
                  <li key={c.category} className="text-sm">
                    <div className="flex justify-between gap-2"><span>{labelFor(c.category)} <span className="opacity-60">· {c.bookings}</span></span><strong>{formatMoney(c.spend, cur)}</strong></div>
                    <ShareBar value={Number(c.spend)} max={Number(data.categories[0]?.spend ?? 0)} color={BI_PALETTE[i % BI_PALETTE.length]} />
                  </li>
                ))}
              </ul>
              {data.purposes.some((x) => x.purpose !== "Not recorded") && (
                <>
                  <h3 className="card-kicker mt-4 mb-1">Purpose (as written in the sheet)</h3>
                  <ul className="text-sm grid gap-1">
                    {data.purposes.map((x) => <li key={x.purpose} className="flex justify-between gap-2"><span>{x.purpose}</span><span className="opacity-70">{x.bookings}</span></li>)}
                  </ul>
                </>
              )}
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Who travelled" note="Open a name for that person's full travel history">
              <table className="bi-table">
                <thead><tr><th>Employee</th><th className="text-right">Bookings</th><th className="text-right">Spend</th><th>Travel</th></tr></thead>
                <tbody>
                  {data.employees.map((e) => (
                    <tr key={e.employee_id}>
                      <td><Link href={`/travel/employees/${e.employee_id}`} className="font-semibold hover:underline">{e.full_name}</Link><div className="table-subline">{e.department}</div></td>
                      <td className="text-right">{e.bookings}{e.without_cost > 0 && <div className="table-subline">{e.without_cost} without cost</div>}</td>
                      <td className="text-right">{formatMoney(e.spend, cur)}</td>
                      <td className="text-xs whitespace-nowrap">{dateRange(e.first_date, e.last_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <div className="grid gap-4">
              <Panel title="Routes">
                {data.routes.length === 0 ? <p className="text-sm opacity-70">No routes recorded (hotel stays and cabs have a place only).</p> : (
                  <table className="bi-table">
                    <thead><tr><th>Route</th><th className="text-right">Bookings</th><th className="text-right">Spend</th></tr></thead>
                    <tbody>{data.routes.map((r) => <tr key={`${r.origin}-${r.destination}`}><td>{routeLabel(r.origin, r.destination)}</td><td className="text-right">{r.bookings}</td><td className="text-right">{formatMoney(r.spend, cur)}</td></tr>)}</tbody>
                  </table>
                )}
              </Panel>
              <Panel title="Airlines, hotels and providers">
                <table className="bi-table">
                  <thead><tr><th>Provider</th><th className="text-right">Bookings</th><th className="text-right">Spend</th></tr></thead>
                  <tbody>{data.providers.map((v) => <tr key={`${v.provider}-${v.category}`}><td>{v.provider}<div className="table-subline">{labelFor(v.category)}</div></td><td className="text-right">{v.bookings}</td><td className="text-right">{formatMoney(v.spend, cur)}</td></tr>)}</tbody>
                </table>
              </Panel>
            </div>
          </div>

          <div className="panel table-panel">
            <div className="table-toolbar flex-wrap">
              <div>
                <h2 className="section-heading">Every booking behind these figures</h2>
                <p className="text-xs opacity-70">
                  {plural(data.ledger_total, "booking")}{data.ledger_total > data.ledger.length ? ` (showing the latest ${data.ledger.length}; download for all)` : ""}.
                  {isCeo && !projectId ? " You can link a booking to a project here when the sheet did not name one." : ""}
                </p>
              </div>
              <label className="toolbar-filters relative">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-60" aria-hidden />
                <input type="search" className="pl-7" placeholder="Search name, place, PNR or provider" aria-label="Search bookings" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
            </div>
            {rowError && <p className="text-sm text-red-600 px-4" role="alert">{rowError}</p>}
            <div className="responsive-table">
              <table>
                <thead><tr><th>Date</th><th>Traveller</th><th>Trip</th><th>Provider / PNR</th><th>From the sheet</th><th className="text-right">Cost</th>{isCeo && <th>Project</th>}</tr></thead>
                <tbody>
                  {ledger.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">{formatDate(r.departure_date)}{r.return_date && r.return_date !== r.departure_date && <div className="table-subline">to {formatDate(r.return_date)}</div>}</td>
                      <td><Link href={`/travel/employees/${r.employee_id}`} className="hover:underline">{r.full_name}</Link><div className="table-subline">{r.employee_code}</div></td>
                      <td>{routeLabel(r.origin, r.destination)}<div className="table-subline">{labelFor(r.category)}{r.status !== "completed" && r.status !== "confirmed" ? ` · ${r.status.replace(/_/g, " ")}` : ""}</div></td>
                      <td>{r.provider ?? "—"}<div className="table-subline">{r.booking_reference ?? ""}</div></td>
                      <td className="text-xs">{r.project_raw ? `“${r.project_raw}”` : <span className="opacity-60">No project</span>}{r.purpose && <div className="table-subline">{r.purpose}</div>}{r.source_sheet && <div className="table-subline">Sheet: {r.source_sheet}</div>}</td>
                      <td className="text-right whitespace-nowrap"><CostCell amount={r.amount} currency={r.currency} state={r.cost_state} status={r.status} />{r.cost_lines > 1 && <div className="table-subline">{r.cost_lines} charges</div>}</td>
                      {isCeo && (
                        <td>
                          <select className="bi-row-select" aria-label={`Project for ${r.full_name} on ${formatDate(r.departure_date)}`} value={projectId ?? ""} onChange={(e) => void assign(r.id, e.target.value)} disabled={!options}>
                            <option value="">Not linked</option>
                            {options?.projects.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                          </select>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}
      {editing && p && <EditProjectDialog project={p} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
    </div>
  );
}

function EditProjectDialog({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Project>(project);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof Project) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await updateProject(form);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the project.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title">
      <form className="confirm-dialog max-w-2xl w-full text-left max-h-[90vh] overflow-y-auto" onSubmit={submit}>
        <button type="button" className="icon-button dialog-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <span className="card-kicker">PROJECT DETAILS</span>
        <h2 id="project-dialog-title">Edit {project.name}</h2>
        <p className="text-xs opacity-70 mt-1">These details are not in the travel sheets. Only fill in what you know; blanks stay blank.</p>
        <div className="grid gap-3 sm:grid-cols-2 mt-4">
          <label className="field sm:col-span-2"><span>Name</span><input value={form.name} onChange={set("name")} required maxLength={200} /></label>
          <label className="field"><span>Type</span>
            <select value={form.kind} onChange={set("kind")}>{(Object.keys(KIND_LABEL) as ProjectKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
          </label>
          <label className="field"><span>Status</span>
            <select value={form.status} onChange={set("status")}>{(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
          </label>
          <label className="field"><span>Project code</span><input value={form.code ?? ""} onChange={set("code")} maxLength={64} /></label>
          <label className="field"><span>Client</span><input value={form.client ?? ""} onChange={set("client")} maxLength={200} /></label>
          <label className="field"><span>Site</span><input value={form.site ?? ""} onChange={set("site")} maxLength={200} /></label>
          <label className="field"><span>Country</span><input value={form.country ?? ""} onChange={set("country")} maxLength={80} /></label>
          <label className="field"><span>Start date</span><input type="date" value={form.start_date ?? ""} onChange={set("start_date")} /></label>
          <label className="field"><span>End date</span><input type="date" value={form.end_date ?? ""} onChange={set("end_date")} min={form.start_date ?? undefined} /></label>
          <label className="field sm:col-span-2"><span>Notes</span><textarea value={form.notes ?? ""} onChange={set("notes")} maxLength={2000} /></label>
        </div>
        {error && <p className="text-sm text-red-600 mt-3" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Save details"}</button>
        </div>
      </form>
    </div>
  );
}
