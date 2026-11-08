import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, FileUp, ScanLine, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useLiveRefresh } from "../../lib/data/reports";
import {
  DOCUMENT_TYPE_LABELS, MAX_DOCUMENT_BYTES, confirmDocument, deleteDocument, getDocumentUrl, listDocuments, scanDocument, uploadDocument,
  type ConfirmFields, type DocumentType, type Extraction, type ExtractedFields, type FieldFlag, type TravelDocument,
} from "../../lib/data/documents";
import { listEmployees, type EmployeeSummary } from "../../lib/data/travel";
import { Empty, ErrorNotice, Loading, PageHeader, formatDate } from "./common";

const STATUS_LABEL: Record<TravelDocument["extraction_status"], { label: string; tone: string }> = {
  none: { label: "not scanned", tone: "pending" },
  pending: { label: "scanning", tone: "pending" },
  extracted: { label: "needs review", tone: "pending" },
  verified: { label: "confirmed", tone: "approved" },
  failed: { label: "scan failed", tone: "rejected" },
};

type Tab = "open" | "extracted" | "verified" | "all";

/**
 * Upload tickets and invoices; Travel Desk / Admin scan them and confirm the
 * suggested booking details before anything is saved as a trip.
 */
export default function Documents({ profileId, canManage }: { profileId: string; canManage: boolean }) {
  const [docs, setDocs] = useState<TravelDocument[] | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>(canManage ? "open" : "all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<TravelDocument | null>(null);

  const load = useCallback(() => {
    setError("");
    listDocuments({ employeeId: canManage ? undefined : profileId, status: tab === "all" ? undefined : tab })
      .then(setDocs)
      .catch((err) => { setDocs([]); setError(err instanceof Error ? err.message : "Could not load documents."); });
  }, [canManage, profileId, tab]);
  useEffect(load, [load]);
  useLiveRefresh(["documents"], load);

  async function view(doc: TravelDocument) {
    try {
      const url = await getDocumentUrl(doc);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The file could not be opened.");
    }
  }

  async function scan(doc: TravelDocument) {
    setBusyId(doc.id);
    try {
      const extraction = await scanDocument(doc.id);
      const updated = { ...doc, extraction_status: "extracted" as const, extracted_data: extraction };
      setDocs((list) => list?.map((d) => (d.id === doc.id ? updated : d)) ?? null);
      setReviewing(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The document could not be scanned.");
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(doc: TravelDocument) {
    if (!window.confirm(`Delete ${doc.original_filename}? This cannot be undone.`)) return;
    setBusyId(doc.id);
    try {
      await deleteDocument(doc);
      toast.success("Document deleted");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the document.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page-stack animate-page">
      <PageHeader
        eyebrow="Travel"
        title="Tickets & documents"
        description={canManage
          ? "Upload tickets or invoices under an employee. Each file shows in that employee’s own Tickets & documents page. Scan them to save the trip details; nothing is saved as a trip until you confirm."
          : "Upload your tickets and invoices. The Travel Desk checks them and adds the trips to your history."}
      />

      <UploadPanel profileId={profileId} canManage={canManage} onUploaded={load} />

      <div className="panel table-panel">
        <div className="table-toolbar flex-wrap">
          <h2 className="section-heading">Documents</h2>
          <div className="toolbar-filters flex flex-wrap gap-1" role="tablist" aria-label="Filter documents">
            {(canManage ? (["open", "extracted", "verified", "all"] as Tab[]) : (["all", "verified"] as Tab[])).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} className={`button ${tab === t ? "button-primary" : "button-ghost"}`} onClick={() => setTab(t)}>
                {{ open: "To do", extracted: "Needs review", verified: "Confirmed", all: "All" }[t]}
              </button>
            ))}
          </div>
        </div>
        {error && <ErrorNotice message={error} onRetry={load} />}
        {docs === null ? <Loading /> : docs.length === 0 ? (
          <Empty title="No documents" description={tab === "all" ? "Uploaded tickets and invoices appear here." : "Nothing in this list right now."} />
        ) : (
          <div className="responsive-table">
            <table>
              <thead><tr><th>File</th>{canManage && <th>Employee</th>}<th>Type</th><th>Uploaded</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {docs.map((d) => {
                  const s = STATUS_LABEL[d.extraction_status];
                  return (
                    <tr key={d.id}>
                      <td className="max-w-[220px] truncate" title={d.original_filename}>{d.original_filename}</td>
                      {canManage && <td>{d.profile?.full_name ?? "—"}<div className="table-subline">{d.profile?.employee_id ?? ""}</div></td>}
                      <td>{DOCUMENT_TYPE_LABELS[d.document_type as DocumentType] ?? d.document_type}</td>
                      <td>{formatDate(d.created_at)}</td>
                      <td><span className={`approval-pill ${s.tone}`}>{s.label}</span></td>
                      <td className="text-right whitespace-nowrap">
                        <button type="button" className="button button-ghost" onClick={() => view(d)} aria-label={`View ${d.original_filename}`}><Eye size={14} /> View</button>
                        {canManage && d.extraction_status !== "verified" && d.mime_type !== "text/csv" && (
                          d.extraction_status === "extracted" ? (
                            <button type="button" className="button button-primary ml-1" onClick={() => setReviewing(d)}>Review</button>
                          ) : (
                            <button type="button" className="button button-primary ml-1" onClick={() => scan(d)} disabled={busyId === d.id}>
                              <ScanLine size={14} /> {busyId === d.id ? "Scanning…" : d.extraction_status === "failed" ? "Scan again" : "Scan"}
                            </button>
                          )
                        )}
                        {canManage && d.extraction_status !== "verified" && (
                          <button type="button" className="icon-button ml-1" onClick={() => remove(d)} disabled={busyId === d.id} aria-label={`Delete ${d.original_filename}`}><Trash2 size={15} /></button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {reviewing && reviewing.extracted_data && (
        <ReviewDialog
          doc={reviewing}
          extraction={reviewing.extracted_data}
          onRescan={() => { const d = reviewing; setReviewing(null); void scan(d); }}
          onClose={() => setReviewing(null)}
          onSaved={() => { setReviewing(null); load(); }}
        />
      )}
    </div>
  );
}

function UploadPanel({ profileId, canManage, onUploaded }: { profileId: string; canManage: boolean; onUploaded: () => void }) {
  const [employee, setEmployee] = useState<{ id: string; label: string } | null>(canManage ? null : { id: profileId, label: "" });
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<EmployeeSummary[]>([]);
  const [type, setType] = useState<DocumentType>("flight_ticket");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!canManage || !query.trim()) { setMatches([]); return; }
    const handle = setTimeout(() => {
      listEmployees({ q: query, limit: 8 }).then((r) => setMatches(r.rows)).catch(() => setMatches([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [canManage, query]);

  async function onFile(file: File | undefined) {
    if (!file || !employee) return;
    setBusy(true);
    setError("");
    try {
      await uploadDocument(employee.id, file, type);
      toast.success("Document uploaded");
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The file could not be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel p-4 grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {canManage && (
          <label className="field relative">
            <span>Employee</span>
            <input
              value={employee?.label || query}
              onChange={(e) => { setEmployee(null); setQuery(e.target.value); }}
              placeholder="Search by name or employee ID"
              aria-autocomplete="list"
            />
            {matches.length > 0 && !employee && (
              <ul className="absolute z-10 left-0 right-0 top-full mt-1 panel p-1 max-h-56 overflow-y-auto" role="listbox">
                {matches.map((m) => (
                  <li key={m.employee_id}>
                    <button type="button" className="w-full text-left px-3 py-2 rounded hover:bg-black/5 text-sm"
                      onClick={() => { setEmployee({ id: m.employee_id, label: `${m.employee_name} (${m.employee_code})` }); setMatches([]); }}>
                      <strong>{m.employee_name}</strong> <span className="opacity-60">{m.employee_code} · {m.department ?? "—"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </label>
        )}
        <label className="field">
          <span>Document type</span>
          <select value={type} onChange={(e) => setType(e.target.value as DocumentType)}>
            {(Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[]).map((t) => <option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</option>)}
          </select>
        </label>
      </div>
      <label
        className={`panel p-6 grid place-items-center text-center gap-2 border-dashed ${employee ? "cursor-pointer" : "opacity-60"}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); void onFile(e.dataTransfer.files?.[0]); }}
      >
        <FileUp size={24} />
        <strong>{busy ? "Uploading…" : employee ? "Drop a ticket or invoice here" : "Choose the employee first"}</strong>
        <span className="text-xs opacity-70">PDF, PNG, JPG or WebP, up to {MAX_DOCUMENT_BYTES / 1024 / 1024} MB. Files are private; links to view them expire after a minute.</span>
        <input type="file" className="sr-only" disabled={!employee || busy} accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
          onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
    </div>
  );
}

const FORM_FIELDS: Array<{ key: keyof ConfirmFields; source: keyof ExtractedFields | null; label: string; type?: string; required?: boolean }> = [
  { key: "origin", source: "origin", label: "From", required: true },
  { key: "destination", source: "destination", label: "To", required: true },
  { key: "departure_date", source: "departure_date", label: "Travel date", type: "date", required: true },
  { key: "return_date", source: "return_date", label: "Return date", type: "date" },
  { key: "provider", source: "provider", label: "Airline / provider" },
  { key: "booking_reference", source: "booking_reference", label: "PNR / booking reference" },
  { key: "ticket_number", source: "ticket_number", label: "Ticket number" },
  { key: "amount", source: "amount", label: "Amount", type: "number" },
  { key: "currency", source: "currency", label: "Currency" },
];

function FlagBadge({ flag }: { flag: FieldFlag | undefined }) {
  if (flag === "check") return <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 whitespace-nowrap" title="Check this value against the document">check</span>;
  if (flag === "missing") return <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 whitespace-nowrap" title="Not found on the document">not found</span>;
  return null;
}

function ReviewDialog({ doc, extraction, onClose, onSaved, onRescan }: {
  doc: TravelDocument;
  extraction: Extraction;
  onClose: () => void;
  onSaved: () => void;
  onRescan: () => void;
}) {
  const f = extraction.fields;
  const [form, setForm] = useState<Record<string, string>>(() => ({
    origin: f.origin ?? "",
    destination: f.destination ?? "",
    departure_date: f.departure_date ?? "",
    return_date: f.return_date ?? "",
    provider: f.provider ?? "",
    booking_reference: f.booking_reference ?? "",
    ticket_number: f.ticket_number ?? "",
    amount: f.amount != null ? String(f.amount) : "",
    currency: f.currency ?? "INR",
    booking_type: f.travel_mode && f.travel_mode !== "other" ? f.travel_mode : "flight",
    document_type: f.document_type ?? (doc.document_type as string),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const flagged = useMemo(() => Object.values(extraction.flags).filter((x) => x === "check").length, [extraction.flags]);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((s) => ({ ...s, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await confirmDocument(doc.id, form as unknown as ConfirmFields);
      toast.success(result.created ? "Trip saved" : "Attached to the existing trip with the same PNR and date");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the trip.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="review-title">
      <form className="confirm-dialog max-w-2xl w-full text-left max-h-[90vh] overflow-y-auto" onSubmit={submit}>
        <button type="button" className="icon-button dialog-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <span className="card-kicker">CHECK SCAN</span>
        <h2 id="review-title">{doc.original_filename}</h2>
        <p className="text-sm opacity-80 mt-1">
          For {doc.profile?.full_name ?? "this employee"}. {extraction.method === "text" ? "Read from the PDF's text." : "Read from the image (no text layer), so check every value."}
          {f.passenger_name ? ` Passenger on the document: ${f.passenger_name}.` : ""}
        </p>

        {(extraction.warnings.length > 0 || flagged > 0) && (
          <div className="panel p-3 mt-3 text-sm grid gap-1" role="status">
            <strong className="flex items-center gap-2"><AlertTriangle size={15} className="text-amber-600" /> Check before saving</strong>
            {extraction.warnings.map((w) => <span key={w}>{w}</span>)}
            {flagged > 0 && extraction.warnings.length === 0 && <span>Fields marked "check" were hard to read.</span>}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 mt-4">
          {FORM_FIELDS.map((field) => (
            <label key={field.key} className="field">
              <span className="flex items-center gap-2">{field.label} {field.source && <FlagBadge flag={extraction.flags[field.source]} />}</span>
              <input
                type={field.type ?? "text"}
                value={form[field.key] ?? ""}
                onChange={set(field.key)}
                required={field.required}
                maxLength={field.key === "currency" ? 3 : 120}
                {...(field.type === "number" ? { min: "0", step: "0.01", inputMode: "decimal" as const } : {})}
              />
            </label>
          ))}
          <label className="field"><span>Mode</span>
            <select value={form.booking_type} onChange={set("booking_type")}>
              {["flight", "train", "bus", "cab", "hotel", "multi_modal", "other"].map((t) => <option key={t} value={t}>{t.replace("_", "-")}</option>)}
            </select>
          </label>
          <label className="field"><span>Document type</span>
            <select value={form.document_type} onChange={set("document_type")}>
              {(Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[]).map((t) => <option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</option>)}
            </select>
          </label>
        </div>

        {error && <p className="text-sm text-red-600 mt-3" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button button-ghost" onClick={onRescan}>Scan again</button>
          <button type="button" className="button button-ghost" onClick={onClose}>Later</button>
          <button type="submit" className="button button-primary" disabled={saving}><CheckCircle2 size={15} /> {saving ? "Saving…" : "Confirm and save trip"}</button>
        </div>
      </form>
    </div>
  );
}
