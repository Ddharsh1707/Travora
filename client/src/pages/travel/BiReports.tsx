import { useCallback, useEffect, useMemo, useState } from "react";
import { FileDown, FileSpreadsheet, FileText } from "lucide-react";
import { getFilterOptions, getReport, useBiFilters, type BiFilters, type BiReport, type FilterOptions, type ReportGrain } from "../../lib/data/bi";
import { recordReportGenerated } from "../../lib/data/travel";
import { GRAIN_LABEL, REPORT_KINDS, buildReport, cellText, formatDay, type ReportKind } from "../../lib/reportDoc";
import BiFilterBar from "./BiFilterBar";
import { Panel } from "./BiParts";
import { Empty, ErrorNotice, Loading, PageHeader, labelFor } from "./common";

const GRAINS: ReportGrain[] = ["week", "month", "quarter", "fy"];
const PREVIEW_ROWS = 8;

/** The filters in words, so a downloaded file says what it covers. */
function describeFilters(f: BiFilters, o: FilterOptions | null): [string, string][] {
  const out: [string, string][] = [];
  if (f.from || f.to) out.push(["Travel dates", `${f.from ? formatDay(f.from) : "start"} to ${f.to ? formatDay(f.to) : "latest"}`]);
  if (f.project) out.push(["Project", f.project === "unassigned" ? "Not linked to a project" : o?.projects.find((p) => p.id === f.project)?.name ?? "One project"]);
  if (f.employee) {
    const e = o?.employees.find((x) => x.id === f.employee);
    out.push(["Employee", e ? `${e.name} (${e.code})` : "One employee"]);
  }
  if (f.department) out.push(["Department", f.department]);
  if (f.destination) out.push(["Destination", f.destination]);
  if (f.category) out.push(["Travel type", labelFor(f.category)]);
  if (out.length === 0) out.push(["Filters", "None (all travel)"]);
  return out;
}

/** Reports to download: pick a report and a period, apply filters, get PDF, Excel or CSV. */
export default function BiReports({ scopeLabel }: { scopeLabel: string }) {
  const [filters, setFilters] = useBiFilters();
  const [kind, setKind] = useState<ReportKind>("management");
  const [grain, setGrain] = useState<ReportGrain>("month");
  const [data, setData] = useState<BiReport | null>(null);
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "pdf" | "xlsx" | "csv">("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => { getFilterOptions().then(setOptions).catch(() => undefined); }, []);
  const load = useCallback(() => {
    setLoading(true);
    setError("");
    getReport(filters, grain)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not build the report."))
      .finally(() => setLoading(false));
  }, [filters, grain]);
  useEffect(() => load(), [load]);

  const doc = useMemo(() => (data ? buildReport(kind, data, { filters: describeFilters(filters, options), scope: scopeLabel, generatedAt: new Date().toISOString() }) : null), [data, kind, filters, options, scopeLabel]);
  const usesGrain = kind !== "completeness" && kind !== "travel";

  async function download(format: "pdf" | "xlsx" | "csv") {
    if (!doc) return;
    setBusy(format);
    setSaveError("");
    try {
      const files = await import("../../lib/reportFiles");
      if (format === "pdf") await files.downloadPdf(doc);
      else if (format === "xlsx") await files.downloadExcel(doc);
      else files.downloadCsv(doc);
      void recordReportGenerated(doc.auditName).catch(() => undefined);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not create the file.");
    } finally {
      setBusy("");
    }
  }

  const empty = data && data.totals.bookings === 0 && data.other_currencies.length === 0;
  return (
    <div className="page-stack animate-page">
      <PageHeader
        eyebrow="BUSINESS INTELLIGENCE"
        title="Download reports"
        description={`Download reports for ${scopeLabel} as PDF, Excel or CSV. Every report says how it was calculated and how complete the data is.`}
      />

      <Panel title="1. Choose a report">
        <div className="bi-report-kinds" role="radiogroup" aria-label="Report">
          {REPORT_KINDS.map((k) => (
            <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className={`bi-report-kind ${kind === k.id ? "on" : ""}`} onClick={() => setKind(k.id)}>
              <strong>{k.title}</strong>
              <span>{k.description}</span>
            </button>
          ))}
        </div>
      </Panel>

      {usesGrain && (
        <Panel title="2. Choose the period" note="Periods follow the travel date. Weeks start on Monday; the financial year runs 1 April to 31 March.">
          <div className="bi-seg" role="group" aria-label="Period">
            {GRAINS.map((g) => <button key={g} type="button" className={grain === g ? "on" : ""} aria-pressed={grain === g} onClick={() => setGrain(g)}>{GRAIN_LABEL[g]}</button>)}
          </div>
        </Panel>
      )}
      <BiFilterBar filters={filters} onChange={setFilters} />

      {error && <ErrorNotice message={error} onRetry={load} />}
      {loading && !data && <Loading label="Building the report…" />}
      {empty && <Empty title="No bookings match" description="Clear some filters or pick other dates." />}

      {doc && !empty && (
        <div className={`page-stack ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          <div className="panel bi-report-download">
            <div>
              <span className="card-kicker">{usesGrain ? "3" : "2"}. DOWNLOAD</span>
              <h2 className="text-lg font-bold">{doc.title}</h2>
              <p className="text-xs opacity-70">{doc.subtitle} · {doc.filters.map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="button button-primary" disabled={!!busy || loading} onClick={() => void download("pdf")}><FileText size={14} /> {busy === "pdf" ? "Creating…" : "PDF"}</button>
              <button type="button" className="button button-ghost" disabled={!!busy || loading} onClick={() => void download("xlsx")}><FileSpreadsheet size={14} /> {busy === "xlsx" ? "Creating…" : "Excel"}</button>
              <button type="button" className="button button-ghost" disabled={!!busy || loading} onClick={() => void download("csv")}><FileDown size={14} /> {busy === "csv" ? "Creating…" : "CSV"}</button>
            </div>
            {saveError && <p className="text-sm text-red-600" role="alert">{saveError}</p>}
          </div>

          <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
            {doc.highlights.map((h) => (
              <div key={h.label} className="bi-report-stat"><span>{h.label}</span><strong>{h.value}</strong></div>
            ))}
          </div>

          {doc.sections.map((s) => (
            <Panel key={s.title} title={s.title} note={s.note}>
              {s.rows.length === 0 ? <p className="text-sm opacity-70">No rows for these filters.</p> : (
                <div className="bi-scroll">
                  <table className="bi-table">
                    <thead><tr>{s.columns.map((c) => <th key={c.label} className={c.kind === "text" ? "" : "text-right"}>{c.label}</th>)}</tr></thead>
                    <tbody>
                      {s.rows.slice(0, PREVIEW_ROWS).map((r, ri) => (
                        <tr key={ri}>{r.map((v, ci) => <td key={ci} className={s.columns[ci].kind === "text" ? "" : "text-right"}>{cellText(v, s.columns[ci].kind, doc.currency)}</td>)}</tr>
                      ))}
                    </tbody>
                    {s.total && s.rows.length <= PREVIEW_ROWS && (
                      <tfoot><tr>{s.total.map((v, ci) => <td key={ci} className={`font-semibold ${s.columns[ci].kind === "text" ? "" : "text-right"}`}>{v == null ? "" : cellText(v, s.columns[ci].kind, doc.currency)}</td>)}</tr></tfoot>
                    )}
                  </table>
                </div>
              )}
              {s.rows.length > PREVIEW_ROWS && <p className="text-xs opacity-70 mt-2">Showing {PREVIEW_ROWS} of {s.rows.length} rows{s.total ? " and no total" : ""}. The download has every row{s.total ? " and the total" : ""}.</p>}
            </Panel>
          ))}

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Data completeness" note="Printed in every download">
              <ul className="bi-report-notes">{doc.completeness.map((c) => <li key={c}>{c}</li>)}</ul>
            </Panel>
            <Panel title="How this was calculated" note="Printed in every download">
              <ul className="bi-report-notes">{doc.methodology.map((c) => <li key={c}>{c}</li>)}</ul>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
