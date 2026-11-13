import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileCheck2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  DOCUMENT_TYPE_LABELS, getDocumentUrl, listDocuments, uploadDocument,
  type DocumentType, type TravelDocument,
} from "../../lib/data/documents";
import { analyzeInBackground } from "./analyzeToast";
import { useLiveRefresh } from "../../lib/data/reports";
import type { TravelRequest } from "../../lib/data/travel";
import { formatDate } from "./common";

/** Statuses where a ticket can be added: the trip has been approved. */
export const TICKET_READY = new Set(["approved", "booked", "completed"]);

const TICKET_TYPES: DocumentType[] = ["flight_ticket", "train_ticket", "bus_ticket", "hotel_voucher", "boarding_pass", "invoice", "other"];

function defaultType(r: Pick<TravelRequest, "travel_type">): DocumentType {
  const t = String(r.travel_type ?? "");
  return t === "train" ? "train_ticket" : t === "bus" ? "bus_ticket" : t === "hotel" ? "hotel_voucher" : "flight_ticket";
}

export async function openDocument(doc: TravelDocument) {
  try {
    const url = await getDocumentUrl(doc);
    window.open(url, "_blank", "noopener,noreferrer");
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "The file could not be opened.");
  }
}

/**
 * Loads the tickets for a list of requests in one call and keeps them fresh.
 * Returns a map of request id -> its documents.
 */
export function useRequestTickets(requests: TravelRequest[]) {
  const [byRequest, setByRequest] = useState<Record<string, TravelDocument[]>>({});
  const ids = requests.filter((r) => TICKET_READY.has(r.status)).map((r) => r.id);
  const key = ids.join(",");
  const load = useCallback(async () => {
    const list = key ? key.split(",") : [];
    if (!list.length) { setByRequest({}); return; }
    try {
      const docs = await listDocuments({ requestIds: list, limit: 500 });
      const map: Record<string, TravelDocument[]> = {};
      for (const d of docs) if (d.travel_request_id) (map[d.travel_request_id] ??= []).push(d);
      setByRequest(map);
    } catch {
      setByRequest({});
    }
  }, [key]);
  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(["documents"], load);
  return { byRequest, reload: load };
}

/** Ticket list for one request, with an upload button for the Director / Travel Desk. */
export function RequestTickets({ request, docs, canUpload, onUploaded }: {
  request: TravelRequest;
  docs: TravelDocument[];
  canUpload: boolean;
  onUploaded?: () => void;
}) {
  const [type, setType] = useState<DocumentType>(() => defaultType(request));
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  if (!TICKET_READY.has(request.status)) return null;
  if (!canUpload && docs.length === 0) {
    return (
      <p className="text-xs opacity-70 flex items-center gap-1.5">
        <FileCheck2 size={14} /> Your ticket will appear here as soon as it is uploaded.
      </p>
    );
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const doc = await uploadDocument(request.employee_id, file, type, null, request.id);
      analyzeInBackground(doc, request.employee?.full_name, onUploaded);
      toast.success(`Ticket uploaded. ${request.employee?.full_name ?? "The employee"} can see it now.`);
      onUploaded?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The ticket could not be uploaded.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="ticket-strip">
      <div className="ticket-strip-head">
        <span className="card-kicker flex items-center gap-1.5"><FileCheck2 size={13} /> {canUpload ? "Tickets for this trip" : "Your tickets"}</span>
        {canUpload && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`ticket-type-${request.id}`}>Ticket type</label>
            <select id={`ticket-type-${request.id}`} className="button button-ghost" value={type} onChange={(e) => setType(e.target.value as DocumentType)} disabled={busy}>
              {TICKET_TYPES.map((t) => <option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</option>)}
            </select>
            <button type="button" className="button button-primary" disabled={busy} onClick={() => input.current?.click()}>
              <Upload size={15} /> {busy ? "Uploading…" : docs.length ? "Upload another" : "Upload ticket"}
            </button>
            <input ref={input} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*" onChange={(e) => void onFile(e.target.files?.[0])} />
          </div>
        )}
      </div>
      {docs.length === 0 ? (
        <p className="text-xs opacity-70">No ticket yet. PDF or photo, up to 10 MB. The employee sees it in their portal straight away.</p>
      ) : (
        <ul className="ticket-list">
          {docs.map((d) => (
            <li key={d.id}>
              <button type="button" className="ticket-chip" onClick={() => void openDocument(d)} title={`Open ${d.original_filename}`}>
                <span className="ticket-chip-type">{DOCUMENT_TYPE_LABELS[d.document_type as DocumentType] ?? "Document"}</span>
                <span className="ticket-chip-name">{d.original_filename}</span>
                <span className="ticket-chip-date">{formatDate(d.created_at)}</span>
                <Download size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
