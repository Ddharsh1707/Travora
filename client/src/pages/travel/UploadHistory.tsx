import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Download, FileSpreadsheet, Search } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { getImportFileUrl, listUploadHistory, type UploadHistoryRow } from "../../lib/data/imports";
import { useLiveRefresh } from "../../lib/data/reports";
import { Empty, ErrorNotice, Loading, PageHeader, Stat, StatusPill, formatDate, formatMoney } from "./common";

const sizeLabel = (n: number | null) => (n == null ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Downloads an upload's original file through a one-minute private link. */
export function DownloadOriginal({ path, filename, compact = false }: { path: string | null | undefined; filename: string; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  if (!path) return compact ? null : <span className="text-xs opacity-60" title="Files uploaded before file storage was switched on were not kept">File not kept</span>;
  async function go() {
    setBusy(true);
    try {
      const url = await getImportFileUrl(path!, filename);
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener";
      a.click();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The file could not be downloaded.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" className={compact ? "table-action inline-flex items-center gap-1" : "button button-ghost"} onClick={go} disabled={busy}>
      <Download size={13} /> {busy ? "Preparing…" : compact ? "Original file" : "Download original file"}
    </button>
  );
}

/** Travel desk, Admin and CEO: every uploaded sheet, who uploaded it, what it added, and the original file. */
export default function UploadHistory() {
  const [rows, setRows] = useState<UploadHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setRows(await listUploadHistory(500));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the upload history.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(["import_batches"], load);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => (!status || r.status === status) && (!term || `${r.original_filename} ${r.uploaded_by}`.toLowerCase().includes(term)));
  }, [rows, q, status]);
  const committed = rows.filter((r) => r.status === "committed");

  return (
    <div className="page-stack animate-page">
      <PageHeader
        eyebrow="TRAVEL DESK"
        title="Upload history"
        description="Every travel Excel sheet that was uploaded, who uploaded it and what it added. The original file is kept privately and can be downloaded at any time."
        actions={<Link href="/travel/import" className="button button-primary"><FileSpreadsheet size={15} /> Upload a new sheet</Link>}
      />
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="Uploads" value={String(rows.length)} detail={`${committed.length} imported`} />
        <Stat label="Trips added" value={committed.reduce((t, r) => t + Number(r.trips), 0).toLocaleString("en-IN")} />
        <Stat label="Spend added" value={formatMoney(committed.reduce((t, r) => t + Number(r.spend), 0))} detail="Not counting cancelled trips" />
        <Stat label="Original files kept" value={String(rows.filter((r) => r.file_path).length)} detail="Earlier uploads have no file" />
      </div>
      <div className="panel p-4 flex flex-wrap gap-2 items-center">
        <div className="search-field flex-1 min-w-[200px] max-w-none"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="File name or who uploaded it" aria-label="Search uploads" maxLength={80} /></div>
        {([["", "All"], ["committed", "Imported"], ["staged", "Not finished"], ["cancelled", "Cancelled"]] as const).map(([k, label]) => (
          <button key={k || "all"} type="button" className={`button ${status === k ? "button-primary" : "button-ghost"}`} onClick={() => setStatus(k)}>{label}</button>
        ))}
      </div>
      {error && <ErrorNotice message={error} onRetry={load} />}
      <div className="panel table-panel">
        {loading ? <Loading /> : shown.length === 0 ? <Empty title="No uploads found" description="Uploaded travel sheets will be listed here." /> : (
          <div className="responsive-table">
            <table>
              <thead><tr><th>File</th><th>Uploaded</th><th className="text-right">Lines</th><th className="text-right">Trips</th><th className="text-right">Spend</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td className="max-w-[260px]">
                      <div className="truncate font-semibold" title={r.original_filename}>{r.original_filename}</div>
                      <div className="table-subline">{r.file_kind.toUpperCase()}{r.file_size ? ` · ${sizeLabel(r.file_size)}` : ""}{r.error_rows ? ` · ${r.error_rows} rows with errors` : ""}{r.duplicate_rows ? ` · ${r.duplicate_rows} duplicates skipped` : ""}</div>
                    </td>
                    <td>{formatDate(r.created_at)}<div className="table-subline">by {r.uploaded_by}</div></td>
                    <td className="text-right">{r.total_rows}</td>
                    <td className="text-right">{Number(r.trips).toLocaleString("en-IN")}</td>
                    <td className="text-right">{formatMoney(Number(r.spend))}</td>
                    <td><StatusPill status={r.status} /></td>
                    <td className="whitespace-nowrap"><div className="flex flex-wrap items-center gap-3">
                      {r.status === "committed" && Number(r.trips) > 0 && <Link href={`/travel/uploads/${r.id}`} className="table-action inline-flex items-center gap-1"><BarChart3 size={13} /> Report</Link>}
                      <DownloadOriginal path={r.file_path} filename={r.original_filename} compact />
                      {!r.file_path && <span className="text-xs opacity-60">File not kept</span>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
