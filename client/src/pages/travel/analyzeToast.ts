import { toast } from "sonner";
import { analyzeDocument, canScan, type TravelDocument } from "../../lib/data/documents";
import { formatDate } from "./common";

/**
 * After the Travel Desk uploads a ticket: read it in the background and save
 * the trip when the details are clear. Never blocks or fails the upload.
 */
export function analyzeInBackground(doc: TravelDocument, employeeName?: string | null, onDone?: () => void): void {
  if (!canScan(doc)) return;
  void analyzeDocument(doc)
    .then((r) => {
      const f = r.extraction.fields;
      if (r.status === "saved") toast.success(`Trip saved${employeeName ? ` for ${employeeName}` : ""}: ${f.origin} → ${f.destination}, ${formatDate(f.departure_date)}`);
      else toast.message(`${doc.original_filename}: ${r.reason} Open Tickets & documents to finish it.`);
    })
    .catch(() => undefined) // scanning not set up or busy: the file is still saved and can be read later
    .finally(() => onDone?.());
}
