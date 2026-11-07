import { getSupabase } from "../supabase";
import { friendlyError } from "./travel";
import type { ColumnMapping } from "./importParser";

export type ImportBatch = {
  id: string;
  original_filename: string;
  file_kind: "csv" | "xlsx";
  status: "staged" | "committed" | "cancelled";
  total_rows: number;
  valid_rows: number;
  warning_rows: number;
  error_rows: number;
  duplicate_rows: number;
  imported_rows: number;
  create_missing_employees?: boolean;
  created_employees?: number;
  format_version?: number;
  assumed_currency?: string | null;
  sheets?: unknown[];
  created_at: string;
  committed_at: string | null;
  file_path?: string | null;
  file_size?: number | null;
  file_stored_at?: string | null;
};

export type ImportRow = {
  id: number;
  row_number: number;
  employee_code: string | null;
  employee_name: string | null;
  department?: string | null;
  new_employee?: boolean;
  profile_id: string | null;
  origin: string | null;
  destination: string | null;
  departure_date: string | null;
  return_date: string | null;
  provider: string | null;
  booking_reference: string | null;
  ticket_number: string | null;
  amount: number | null;
  currency: string;
  booking_type: string;
  status: "valid" | "warning" | "error" | "duplicate" | "imported" | "skipped";
  messages: string[];
  profile?: { full_name: string; employee_id: string } | null;
};

/** Sends mapped rows to the database, which validates them and returns a batch id. Nothing is imported yet. */
export async function stageImport(filename: string, kind: "csv" | "xlsx", mapping: ColumnMapping, rows: Array<Record<string, string>>, createMissing = false): Promise<string> {
  const { data, error } = await getSupabase().rpc("import_stage", {
    p_filename: filename.slice(0, 255),
    p_file_kind: kind,
    p_mapping: mapping,
    p_rows: rows,
    p_create_missing: createMissing,
  });
  if (error) throw friendlyError(error, "Could not check the file.");
  return data as string;
}

export async function getImportBatch(id: string): Promise<ImportBatch> {
  const { data, error } = await getSupabase().from("import_batches").select("*").eq("id", id).single();
  if (error) throw friendlyError(error, "Could not load the import.");
  return data as ImportBatch;
}

export async function getImportRows(id: string): Promise<ImportRow[]> {
  const { data, error } = await getSupabase()
    .from("import_rows")
    .select("*, profile:profiles(full_name, employee_id)")
    .eq("batch_id", id)
    .order("row_number", { ascending: true })
    .limit(5000);
  if (error) throw friendlyError(error, "Could not load the preview.");
  return (data ?? []) as ImportRow[];
}

export async function commitImport(id: string, includeWarnings: boolean): Promise<ImportBatch> {
  const { data, error } = await getSupabase().rpc("import_commit", { p_batch: id, p_include_warnings: includeWarnings });
  if (error) throw friendlyError(error, "Could not import the rows.");
  return data as ImportBatch;
}

export async function cancelImport(id: string): Promise<void> {
  const { error } = await getSupabase().rpc("import_cancel", { p_batch: id });
  if (error) throw friendlyError(error, "Could not cancel the import.");
}

export async function listImportBatches(): Promise<ImportBatch[]> {
  const { data, error } = await getSupabase().from("import_batches").select("*").order("created_at", { ascending: false }).limit(20);
  if (error) throw friendlyError(error, "Could not load past imports.");
  return (data ?? []) as ImportBatch[];
}

// ---------------------------------------------------------------------------
// The original uploaded file, kept in the private "import-files" bucket
// ---------------------------------------------------------------------------
export const IMPORT_FILE_BUCKET = "import-files";
const IMPORT_FILE_MIME = { xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv" } as const;

async function sha256Hex(file: Blob): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/**
 * Stores the exact file behind an upload, once. The database only accepts it
 * in that upload's own folder and never lets it be replaced or deleted.
 */
export async function storeImportFile(batchId: string, file: File, kind: "csv" | "xlsx"): Promise<void> {
  const supabase = getSupabase();
  const path = `${batchId}/${crypto.randomUUID()}.${kind}`;
  const { error: uploadError } = await supabase.storage.from(IMPORT_FILE_BUCKET).upload(path, file, { contentType: IMPORT_FILE_MIME[kind], upsert: false });
  if (uploadError) throw new Error("The original file could not be stored. The upload itself is fine.");
  const { error } = await supabase.rpc("import_attach_file", { p_batch: batchId, p_path: path, p_size: file.size, p_sha256: await sha256Hex(file) });
  if (error) throw friendlyError(error, "The original file was stored but could not be linked to the upload.");
}

/** A one-minute download link for an upload's original file. */
export async function getImportFileUrl(path: string, filename: string): Promise<string> {
  const { data, error } = await getSupabase().storage.from(IMPORT_FILE_BUCKET).createSignedUrl(path, 60, { download: filename });
  if (error || !data?.signedUrl) throw new Error("The file could not be opened.");
  return data.signedUrl;
}

export type UploadHistoryRow = {
  id: string; original_filename: string; file_kind: "csv" | "xlsx"; status: ImportBatch["status"]; format_version: number;
  total_rows: number; valid_rows: number; warning_rows: number; error_rows: number; duplicate_rows: number; imported_rows: number;
  created_at: string; committed_at: string | null; uploaded_by: string;
  file_path: string | null; file_size: number | null; file_stored_at: string | null; trips: number; spend: number;
};

export async function listUploadHistory(limit = 200, offset = 0): Promise<UploadHistoryRow[]> {
  const { data, error } = await getSupabase().rpc("import_history", { p_limit: limit, p_offset: offset });
  if (error) throw friendlyError(error, "Could not load the upload history. Has the latest SQL been run in Supabase?");
  return (data ?? []) as UploadHistoryRow[];
}

export type UploadReport = {
  batch: {
    id: string; original_filename: string; status: ImportBatch["status"]; created_at: string; committed_at: string | null;
    total_rows: number; imported_rows: number; error_rows: number; duplicate_rows: number; created_employees: number;
  };
  totals: { trips: number; travellers: number; spend: number; trips_without_cost: number; currencies: string[]; upcoming: number; first_date: string | null; last_date: string | null };
  by_month: Array<{ month: string; trips: number; spend: number; travellers: number }>;
  by_department: Array<{ department: string; trips: number; spend: number; travellers: number }>;
  by_mode: Array<{ mode: string; trips: number; spend: number }>;
  top_routes: Array<{ origin: string; destination: string; trips: number; spend: number }>;
  top_providers: Array<{ provider: string; trips: number; spend: number }>;
  employees: Array<{ employee_id: string; employee_code: string; full_name: string; department: string; trips: number; spend: number; first_trip: string; last_trip: string }>;
};

/** The report for one uploaded file. Travel Desk / CEO only (checked by the database). */
export async function getUploadReport(id: string): Promise<UploadReport> {
  const { data, error } = await getSupabase().rpc("import_report", { p_batch: id });
  if (error) throw friendlyError(error, "Could not load the upload report.");
  return data as UploadReport;
}


// ---------------------------------------------------------------------------
// Multi-sheet workbook upload (import_stage_v2 → People → Projects → import_commit_v2)
// ---------------------------------------------------------------------------
export type WorkbookRow = ImportRow & {
  sheet_name: string | null;
  source_row: number | null;
  name_key: string | null;
  project_raw: string | null;
  line_type: string | null;
  amount_state: "recorded" | "zero" | "missing" | "included_in_group" | null;
  record_status: string | null;
  details: Record<string, string>;
};

export type NameReview = {
  id: number;
  name_key: string;
  display_name: string;
  raw_names: string[];
  employee_code: string | null;
  department: string | null;
  row_count: number;
  suggested_profile_id: string | null;
  match_reason: string | null;
  decision: "pending" | "link" | "create" | "skip";
  profile_id: string | null;
  suggested?: { full_name: string; employee_id: string; department: string | null } | null;
};

export type UploadProject = { alias_key: string; label: string; rows: number; amount: number; project_id: string | null; project_name: string | null; project_kind: string | null };
export type Project = { id: string; name: string; kind: "project" | "cost_centre" | "event" | "other"; code: string | null; status: string; client: string | null };
export type PersonOption = { id: string; full_name: string; employee_id: string; department: string | null };

export async function stageWorkbook(filename: string, kind: "csv" | "xlsx", sheets: unknown[], lines: unknown[], createMissing: boolean, currency: string): Promise<string> {
  const { data, error } = await getSupabase().rpc("import_stage_v2", {
    p_filename: filename.slice(0, 255), p_file_kind: kind, p_sheets: sheets, p_rows: lines,
    p_create_missing: createMissing, p_currency: currency,
  });
  if (error) throw friendlyError(error, "Could not check the file.");
  return data as string;
}

export async function getWorkbookRows(id: string): Promise<WorkbookRow[]> {
  const { data, error } = await getSupabase()
    .from("import_rows")
    .select("*, profile:profiles(full_name, employee_id)")
    .eq("batch_id", id)
    .order("row_number", { ascending: true })
    .limit(5000);
  if (error) throw friendlyError(error, "Could not load the preview.");
  return (data ?? []) as WorkbookRow[];
}

export async function getNameReviews(id: string): Promise<NameReview[]> {
  const { data, error } = await getSupabase()
    .from("name_match_reviews")
    .select("*, suggested:profiles!name_match_reviews_suggested_profile_id_fkey(full_name, employee_id, department)")
    .eq("batch_id", id)
    .order("row_count", { ascending: false })
    .limit(5000);
  if (error) throw friendlyError(error, "Could not load the people to review.");
  return (data ?? []) as NameReview[];
}

export async function decideNames(id: string, decisions: Array<{ name_key: string; decision: NameReview["decision"]; profile_id?: string | null }>): Promise<void> {
  const { error } = await getSupabase().rpc("name_match_decide", { p_batch: id, p_decisions: decisions });
  if (error) throw friendlyError(error, "Could not save the people decisions.");
}

export async function listPeopleOptions(): Promise<PersonOption[]> {
  const { data, error } = await getSupabase().from("profiles").select("id, full_name, employee_id, department").eq("active", true).order("full_name").limit(5000);
  if (error) throw friendlyError(error, "Could not load employees.");
  return (data ?? []) as PersonOption[];
}

export async function getUploadProjects(id: string): Promise<UploadProject[]> {
  const { data, error } = await getSupabase().rpc("import_projects", { p_batch: id });
  if (error) throw friendlyError(error, "Could not load the project names.");
  return (data ?? []) as UploadProject[];
}

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await getSupabase().from("projects").select("id, name, kind, code, status, client").order("name").limit(2000);
  if (error) throw friendlyError(error, "Could not load projects.");
  return (data ?? []) as Project[];
}

export async function createProject(name: string, kind: Project["kind"]): Promise<string> {
  const { data, error } = await getSupabase().rpc("project_create", { p_name: name.slice(0, 200), p_kind: kind, p_code: null });
  if (error) throw friendlyError(error, "Could not create the project.");
  return data as string;
}

export async function setProjectAlias(alias: string, projectId: string | null): Promise<number> {
  const { data, error } = await getSupabase().rpc("project_alias_set", { p_alias: alias.slice(0, 200), p_project: projectId });
  if (error) throw friendlyError(error, "Could not save the project mapping.");
  return Number(data ?? 0);
}

export async function commitWorkbook(id: string, includeWarnings: boolean): Promise<ImportBatch> {
  const { data, error } = await getSupabase().rpc("import_commit_v2", { p_batch: id, p_include_warnings: includeWarnings });
  if (error) throw friendlyError(error, "Could not import the rows.");
  return data as ImportBatch;
}
