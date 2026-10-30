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
  created_at: string;
  committed_at: string | null;
};

export type ImportRow = {
  id: number;
  row_number: number;
  employee_code: string | null;
  employee_name: string | null;
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
export async function stageImport(filename: string, kind: "csv" | "xlsx", mapping: ColumnMapping, rows: Array<Record<string, string>>): Promise<string> {
  const { data, error } = await getSupabase().rpc("import_stage", {
    p_filename: filename.slice(0, 255),
    p_file_kind: kind,
    p_mapping: mapping,
    p_rows: rows,
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
