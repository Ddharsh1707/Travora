import { getSupabase } from "../supabase";
import { friendlyError } from "./travel";
import { canAutoSave } from "../../../../supabase/functions/_shared/ticket";

/**
 * Travel documents (tickets, invoices, boarding passes) in the private
 * "travel-documents" bucket, plus the scan → review → confirm flow.
 * Every call runs as the signed-in user, so Row Level Security and the
 * storage policies decide what can be read or written.
 */

export const DOCUMENT_BUCKET = "travel-documents";
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_SECONDS = 60;

export type DocumentType =
  | "flight_ticket" | "train_ticket" | "bus_ticket" | "hotel_voucher" | "invoice" | "boarding_pass" | "other";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  flight_ticket: "Flight ticket",
  train_ticket: "Train ticket",
  bus_ticket: "Bus ticket",
  hotel_voucher: "Hotel voucher",
  invoice: "Invoice",
  boarding_pass: "Boarding pass",
  other: "Other",
};

export type ExtractionStatus = "none" | "pending" | "extracted" | "verified" | "failed";
export type FieldFlag = "ok" | "check" | "missing";

export type ExtractedFields = {
  document_type?: DocumentType;
  passenger_name: string | null;
  origin: string | null;
  destination: string | null;
  departure_date: string | null;
  return_date: string | null;
  provider: string | null;
  booking_reference: string | null;
  ticket_number: string | null;
  amount: number | null;
  currency: string | null;
  travel_mode: string;
};

export type Extraction = {
  method: "text" | "ocr";
  model?: string;
  extracted_at: string;
  fields: ExtractedFields;
  flags: Partial<Record<keyof ExtractedFields, FieldFlag>>;
  warnings: string[];
  verified_at?: string;
};

export type TravelDocument = {
  id: string;
  employee_id: string;
  travel_record_id: string | null;
  /** The approved travel request this ticket was booked for (needs migration 20261108000300). */
  travel_request_id?: string | null;
  document_type: DocumentType | "bulk_booking" | "spreadsheet";
  storage_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number | null;
  extraction_status: ExtractionStatus;
  extracted_data: Extraction | null;
  created_at: string;
  profile?: { full_name: string; employee_id: string } | null;
  request?: { origin: string; destination: string; departure_date: string; return_date: string | null; status: string } | null;
};

type Mime = "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
const EXT: Record<Mime, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export type DocumentFileCheck = { ok: true; mime: Mime; ext: string } | { ok: false; error: string };

/** Checks name, size and the file's real first bytes, so a renamed file is refused before upload. */
export function checkDocumentFile(name: string, size: number, head: Uint8Array): DocumentFileCheck {
  const lower = name.toLowerCase();
  const declared: Mime | null = lower.endsWith(".pdf") ? "application/pdf"
    : lower.endsWith(".png") ? "image/png"
    : lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "image/jpeg"
    : lower.endsWith(".webp") ? "image/webp"
    : null;
  if (!declared) return { ok: false, error: "Upload a PDF, PNG, JPG or WebP file." };
  if (size === 0) return { ok: false, error: "The file is empty." };
  if (size > MAX_DOCUMENT_BYTES) return { ok: false, error: "The file is larger than 10 MB." };
  const b = head;
  const actual: Mime | null =
    b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 ? "application/pdf"
    : b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 ? "image/png"
    : b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? "image/jpeg"
    : b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 ? "image/webp"
    : null;
  if (actual !== declared) return { ok: false, error: "The file content does not match its name. Upload the original file." };
  return { ok: true, mime: actual, ext: EXT[actual] };
}

/** Storage path: <employee id>/<random id>.<ext>. The user's filename never reaches the path. */
export function documentPath(employeeId: string, ext: string, id: string = crypto.randomUUID()): string {
  return `${employeeId}/${id}.${ext}`;
}

const SELECT = "id, employee_id, travel_record_id, document_type, storage_path, original_filename, mime_type, size_bytes, extraction_status, extracted_data, created_at, profile:profiles!documents_employee_id_fkey(full_name, employee_id)";
// With the request a ticket belongs to. Needs migration 20261108000300; until
// it runs, the plain SELECT is used so the page keeps working.
const SELECT_WITH_REQUEST = `${SELECT}, travel_request_id, request:travel_requests!documents_travel_request_id_fkey(origin, destination, departure_date, return_date, status)`;
let requestColumnMissing = false;

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export async function listDocuments(opts: { employeeId?: string; status?: ExtractionStatus | "open"; requestIds?: string[]; limit?: number } = {}): Promise<TravelDocument[]> {
  if (opts.requestIds && opts.requestIds.length === 0) return [];
  const run = (select: string) => {
    let q = getSupabase().from("documents").select(select).order("created_at", { ascending: false }).limit(Math.min(opts.limit ?? 100, 500));
    if (opts.employeeId) q = q.eq("employee_id", opts.employeeId);
    if (opts.requestIds) q = q.in("travel_request_id", opts.requestIds);
    if (opts.status === "open") q = q.neq("extraction_status", "verified");
    else if (opts.status) q = q.eq("extraction_status", opts.status);
    return q;
  };
  let { data, error } = await run(requestColumnMissing ? SELECT : SELECT_WITH_REQUEST);
  if (error && !requestColumnMissing && /travel_request|relationship|schema cache|column/i.test(error.message ?? "")) {
    requestColumnMissing = true;
    if (opts.requestIds) return [];
    ({ data, error } = await run(SELECT));
  }
  if (error) throw friendlyError(error, "Could not load documents.");
  return ((data ?? []) as unknown as TravelDocument[]).map((d) => ({ ...d, profile: one(d.profile), request: one(d.request) }));
}

export async function uploadDocument(employeeId: string, file: File, documentType: DocumentType, travelRecordId?: string | null, travelRequestId?: string | null): Promise<TravelDocument> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const check = checkDocumentFile(file.name, file.size, head);
  if (!check.ok) throw new Error(check.error);

  const supabase = getSupabase();
  const path = documentPath(employeeId, check.ext);
  const { error: uploadError } = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, file, { contentType: check.mime, upsert: false });
  if (uploadError) throw new Error("The file could not be uploaded. Please try again.");

  const { data, error } = await supabase
    .from("documents")
    .insert({
      employee_id: employeeId,
      travel_record_id: travelRecordId ?? null,
      ...(travelRequestId ? { travel_request_id: travelRequestId } : {}),
      document_type: documentType,
      storage_path: path,
      original_filename: file.name.slice(0, 255),
      mime_type: check.mime,
      size_bytes: file.size,
    })
    .select(SELECT)
    .single();
  if (error) {
    // Do not leave an orphan file behind when the row is refused.
    await supabase.storage.from(DOCUMENT_BUCKET).remove([path]).catch(() => undefined);
    if (travelRequestId && /travel_request_id/i.test(error.message ?? "")) {
      throw new Error("Ticket uploads need the latest database update. Ask the Director to run the SQL file in Supabase.");
    }
    throw friendlyError(error, "The file was uploaded but could not be saved. Please try again.");
  }
  return data as unknown as TravelDocument;
}

const SHEET_MIME = { xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv" } as const;

/**
 * Keeps an employee's uploaded expense sheet in their private folder, so the
 * Travel Desk and Director can open the exact file the claims came from.
 */
export async function uploadSpreadsheetDocument(employeeId: string, file: File, kind: "xlsx" | "csv"): Promise<TravelDocument> {
  const supabase = getSupabase();
  const path = documentPath(employeeId, kind);
  const { error: uploadError } = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, file, { contentType: SHEET_MIME[kind], upsert: false });
  if (uploadError) throw new Error("The sheet could not be uploaded. Please try again.");
  const { data, error } = await supabase
    .from("documents")
    .insert({
      employee_id: employeeId,
      document_type: "spreadsheet",
      storage_path: path,
      original_filename: file.name.slice(0, 255),
      mime_type: SHEET_MIME[kind],
      size_bytes: file.size,
    })
    .select(SELECT)
    .single();
  if (error) throw friendlyError(error, "The sheet was uploaded but could not be saved. Please try again.");
  return data as unknown as TravelDocument;
}

/** Short-lived link to view a file. Only works if the storage policy lets the caller see it. */
export async function getDocumentUrl(doc: Pick<TravelDocument, "storage_path">): Promise<string> {
  const { data, error } = await getSupabase().storage.from(DOCUMENT_BUCKET).createSignedUrl(doc.storage_path, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) throw new Error("The file could not be opened.");
  return data.signedUrl;
}

/** Runs the scanner (Travel Desk / Admin). Returns suggested fields; nothing is saved as a trip yet. */
export async function scanDocument(id: string): Promise<Extraction> {
  const { data, error } = await getSupabase().functions.invoke("document-extract", { body: { documentId: id } });
  if (error) {
    let message = "The document could not be scanned.";
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body && typeof body.error === "string") message = body.error;
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }
  return (data as { extraction: Extraction }).extraction;
}

export type ConfirmFields = {
  origin: string;
  destination: string;
  departure_date: string;
  return_date?: string;
  provider?: string;
  booking_reference?: string;
  ticket_number?: string;
  amount?: string;
  currency?: string;
  booking_type?: string;
  document_type?: string;
};

/** A person checked the fields: save the trip (or attach to the existing one with the same PNR and date). */
export async function confirmDocument(id: string, fields: ConfirmFields): Promise<{ record_id: string; created: boolean }> {
  const clean = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]).filter(([, v]) => v !== "" && v !== undefined));
  const { data, error } = await getSupabase().rpc("document_confirm", { p_document: id, p_fields: clean });
  if (error) throw friendlyError(error, "Could not save the trip.");
  return data as { record_id: string; created: boolean };
}

/** Removes a document that was uploaded by mistake (Travel Desk / Admin). Confirmed trips stay. */
export async function deleteDocument(doc: Pick<TravelDocument, "id" | "storage_path">): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("documents").delete().eq("id", doc.id);
  if (error) throw friendlyError(error, "Could not delete the document.");
  await supabase.storage.from(DOCUMENT_BUCKET).remove([doc.storage_path]);
}

// ---------------------------------------------------------------------------
// Automatic analysis: scan, then save the trip straight away when the scan is
// clear (From, To and travel date read with confidence). Anything unclear is
// left as "needs review" for a person; nothing is guessed.
// ---------------------------------------------------------------------------

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.onload = () => {
      const s = String(reader.result ?? "");
      resolve(s.slice(s.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

async function invokeScanner(body: Record<string, unknown>): Promise<Extraction> {
  const { data, error } = await getSupabase().functions.invoke("document-extract", { body });
  if (error) {
    let message = "The document could not be scanned.";
    try {
      const payload = await (error as { context?: Response }).context?.json();
      if (payload && typeof payload.error === "string") message = payload.error;
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }
  return (data as { extraction: Extraction }).extraction;
}

/** Scans a file that is not uploaded yet (Travel Desk / Admin / Director). Nothing is saved. */
export async function scanFile(file: File): Promise<Extraction> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const check = checkDocumentFile(file.name, file.size, head);
  if (!check.ok) throw new Error(check.error);
  return invokeScanner({ file: await fileToBase64(file), mimeType: check.mime, filename: file.name.slice(0, 255) });
}

/** Stores a scan made before upload on the document, as if it had been scanned there. */
export async function saveScan(documentId: string, extraction: Extraction): Promise<void> {
  const { error } = await getSupabase().from("documents").update({ extraction_status: "extracted", extracted_data: extraction }).eq("id", documentId);
  if (error) throw friendlyError(error, "Could not save the scan.");
}

/** The fields document_confirm() gets from a scan. */
export function fieldsFromScan(extraction: Extraction, fallbackType: string): ConfirmFields {
  const f = extraction.fields;
  return {
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
    document_type: f.document_type ?? fallbackType,
  };
}

/** Everything the person should look at after an automatic save. */
export function scanNotes(extraction: Extraction): string[] {
  const unsure = Object.entries(extraction.flags).filter(([, v]) => v === "check").map(([k]) => SCAN_LABELS[k as keyof ExtractedFields] ?? k);
  return [...extraction.warnings, ...(unsure.length && extraction.warnings.length === 0 ? [`Check: ${unsure.join(", ")}.`] : [])];
}

const SCAN_LABELS: Partial<Record<keyof ExtractedFields, string>> = {
  passenger_name: "passenger name", origin: "from", destination: "to", departure_date: "travel date", return_date: "return date",
  provider: "provider", booking_reference: "PNR", ticket_number: "ticket number", amount: "amount", currency: "currency",
};

export type AutoResult =
  | { status: "saved"; created: boolean; extraction: Extraction; notes: string[] }
  | { status: "review"; extraction: Extraction; reason: string };

/** Saves the trip when the scan is clear, otherwise leaves the document for review. */
export async function autoSaveScan(doc: Pick<TravelDocument, "id" | "document_type">, extraction: Extraction): Promise<AutoResult> {
  if (!canAutoSave(extraction)) {
    const missing = (["origin", "destination", "departure_date"] as const).filter((k) => !extraction.fields[k] || extraction.flags[k] === "check").map((k) => SCAN_LABELS[k]);
    return { status: "review", extraction, reason: `Could not read ${missing.join(", ")} clearly. Check and save it.` };
  }
  try {
    const r = await confirmDocument(doc.id, fieldsFromScan(extraction, doc.document_type));
    return { status: "saved", created: r.created, extraction, notes: scanNotes(extraction) };
  } catch (err) {
    return { status: "review", extraction, reason: err instanceof Error ? err.message : "Could not save the trip." };
  }
}

/** Scans an uploaded document and saves the trip when the scan is clear. */
export async function analyzeDocument(doc: Pick<TravelDocument, "id" | "document_type">): Promise<AutoResult> {
  const extraction = await scanDocument(doc.id);
  return autoSaveScan(doc, extraction);
}

export function canScan(doc: Pick<TravelDocument, "mime_type" | "extraction_status">): boolean {
  return ["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(doc.mime_type) && doc.extraction_status !== "verified";
}
