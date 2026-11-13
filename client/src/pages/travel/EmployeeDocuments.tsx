import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, Plane, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  DOCUMENT_TYPE_LABELS, listDocuments, uploadDocument,
  type DocumentType, type TravelDocument,
} from "../../lib/data/documents";
import { analyzeInBackground } from "./analyzeToast";
import { useLiveRefresh } from "../../lib/data/reports";
import { Empty, ErrorNotice, Loading, PageHeader, formatDate } from "./common";
import { openDocument } from "./RequestTickets";

const UPLOAD_TYPES: DocumentType[] = ["flight_ticket", "train_ticket", "bus_ticket", "hotel_voucher", "boarding_pass", "invoice", "other"];

function typeLabel(d: TravelDocument): string {
  if (d.document_type === "spreadsheet") return "Expense sheet";
  if (d.document_type === "bulk_booking") return "Group booking";
  return DOCUMENT_TYPE_LABELS[d.document_type as DocumentType] ?? "Document";
}

function sizeLabel(bytes: number | null): string {
  if (!bytes) return "";
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Every document filed under one employee: tickets for their approved trips
 * first, then everything else. Employees see this read-only in their portal;
 * the Director and Travel Desk can also add files from the employee's record.
 */
export function EmployeeDocumentsPanel({ employeeId, canUpload, employeeName }: { employeeId: string; canUpload: boolean; employeeName?: string }) {
  const [docs, setDocs] = useState<TravelDocument[] | null>(null);
  const [error, setError] = useState("");
  const [type, setType] = useState<DocumentType>("flight_ticket");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setError("");
    listDocuments({ employeeId, limit: 300 })
      .then(setDocs)
      .catch((err) => { setDocs([]); setError(err instanceof Error ? err.message : "Could not load documents."); });
  }, [employeeId]);
  useEffect(load, [load]);
  useLiveRefresh(["documents"], load);

  const tickets = useMemo(() => (docs ?? []).filter((d) => d.travel_request_id), [docs]);
  const others = useMemo(() => (docs ?? []).filter((d) => !d.travel_request_id), [docs]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const doc = await uploadDocument(employeeId, file, type);
      analyzeInBackground(doc, employeeName, load);
      toast.success(`Saved. ${employeeName ?? "The employee"} can see it in their portal.`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The file could not be uploaded.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const row = (d: TravelDocument) => (
    <li key={d.id} className="doc-row">
      <span className="doc-row-icon">{d.travel_request_id ? <Plane size={15} /> : <FileText size={15} />}</span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold truncate" title={d.original_filename}>{d.original_filename}</div>
        <div className="text-xs opacity-70 truncate">
          {typeLabel(d)}
          {d.request ? ` · ${d.request.origin} → ${d.request.destination}, ${formatDate(d.request.departure_date)}` : ""}
          {` · added ${formatDate(d.created_at)}`}
          {sizeLabel(d.size_bytes) ? ` · ${sizeLabel(d.size_bytes)}` : ""}
        </div>
      </div>
      <button type="button" className="button button-ghost" onClick={() => void openDocument(d)} aria-label={`Open ${d.original_filename}`}>
        <Download size={14} /> Open
      </button>
    </li>
  );

  return (
    <section className="panel p-4 grid gap-3 min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="card-kicker">Tickets &amp; documents</span>
        <span className="text-xs opacity-60">{docs ? `${docs.length} file${docs.length === 1 ? "" : "s"}` : ""}</span>
        {canUpload && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`doc-type-${employeeId}`}>Document type</label>
            <select id={`doc-type-${employeeId}`} className="button button-ghost" value={type} onChange={(e) => setType(e.target.value as DocumentType)} disabled={busy}>
              {UPLOAD_TYPES.map((t) => <option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</option>)}
            </select>
            <button type="button" className="button button-primary" disabled={busy} onClick={() => input.current?.click()}>
              <Upload size={15} /> {busy ? "Uploading…" : "Add document"}
            </button>
            <input ref={input} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*" onChange={(e) => void onFile(e.target.files?.[0])} />
          </div>
        )}
      </div>
      {error && <ErrorNotice message={error} onRetry={load} />}
      {docs === null ? <Loading /> : docs.length === 0 ? (
        <Empty
          title="No documents yet"
          description={canUpload ? "Tickets you upload for this person's approved trips, and files you add here, show up in their portal." : "Tickets for your approved trips and any document the Travel Desk or Director files for you will show here."}
        />
      ) : (
        <div className="grid gap-4">
          {tickets.length > 0 && (
            <div className="grid gap-1.5">
              <div className="text-xs font-semibold uppercase tracking-wider opacity-60">Tickets for trips</div>
              <ul className="doc-list">{tickets.map(row)}</ul>
            </div>
          )}
          {others.length > 0 && (
            <div className="grid gap-1.5">
              <div className="text-xs font-semibold uppercase tracking-wider opacity-60">Other documents</div>
              <ul className="doc-list">{others.map(row)}</ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Employee portal page: their own tickets and documents, read-only. */
export default function EmployeeDocuments({ profileId }: { profileId: string }) {
  return (
    <div className="page-stack animate-page">
      <PageHeader
        eyebrow="Employee"
        title="Tickets & documents"
        description="Your tickets and travel papers. When the Director or Travel Desk uploads a ticket for one of your approved trips, it appears here and on that request."
      />
      <EmployeeDocumentsPanel employeeId={profileId} canUpload={false} />
    </div>
  );
}
