import { MAX_ROWS, checkTravelUploadFile } from "./importParser";
import { analyzeWorkbook, sheetSummaryForDb, type SheetInput } from "./workbook";
import { readUploadFile } from "./readUploadFile";
import {
  commitWorkbook, createProject, decideNames, getNameReviews, getUploadProjects, listProjects, markNewPeopleLeft, setProjectAlias, stageWorkbook, storeImportFile,
  type ImportBatch, type NameDecision, type NameReview, type PersonOption, type Project,
} from "./imports";
import {
  DOCUMENT_TYPE_LABELS, MAX_DOCUMENT_BYTES, autoSaveScan, checkDocumentFile, saveScan, scanFile, uploadDocument,
  type AutoResult, type DocumentType, type Extraction,
} from "./documents";
import { matchPassenger } from "../../../../supabase/functions/_shared/ticket";

/**
 * "Upload anything": one drop zone for every kind of file. The app works out
 * what the file is and saves what it finds without the step-by-step wizard:
 *  - Excel / CSV / PDF with tables: every sheet is read, columns are matched
 *    automatically, travellers are linked to employees with the same name (or
 *    added as new people), project names are linked to the existing project
 *    with the same name (or created), and the lines are imported.
 *  - A ticket, invoice or boarding pass (PDF or photo): it is scanned, the
 *    passenger is matched to an employee, the file is filed under them and
 *    the trip is saved when the scan is clear.
 * Every decision stays visible afterwards (upload report, Tickets & documents)
 * and can be changed there.
 */

export type FileRoute = "sheet" | "pdf" | "ticket";

/** Which path a file takes, from its name and real first bytes. */
export function routeFor(name: string, size: number, head: Uint8Array): { ok: true; route: FileRoute } | { ok: false; error: string } {
  const lower = name.toLowerCase();
  if (/\.(png|jpe?g|webp)$/.test(lower)) {
    const check = checkDocumentFile(name, size, head);
    return check.ok ? { ok: true, route: "ticket" } : check;
  }
  if (/\.(xlsx|csv|pdf)$/.test(lower)) {
    const check = checkTravelUploadFile(name, size, head);
    if (!check.ok) return check;
    return { ok: true, route: check.kind === "pdf" ? "pdf" : "sheet" };
  }
  return { ok: false, error: "Upload an Excel (.xlsx), CSV, PDF, or a photo of a ticket (PNG, JPG, WebP)." };
}

const keyOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * What to do with travellers who are not in the app yet (Travel Desk and Director):
 *  - "temporary_worker": add them to the temporary workforce;
 *  - "permanent_employee": add them as permanent employees;
 *  - "ask": add them as Unknown, and leave anyone who may already be on file for a person to decide.
 * People already in the app (same ID, same name or a saved spelling) are always linked, never added again.
 */
export type NewPeopleMode = "temporary_worker" | "permanent_employee" | "ask";

export const NEW_PEOPLE_LABELS: Record<NewPeopleMode, string> = {
  temporary_worker: "Add to temporary workforce",
  permanent_employee: "Add as permanent employees",
  ask: "Ask me for each person",
};

/**
 * Link to the suggested person; otherwise add as new, or leave out when adding is switched off.
 * Someone who may already be on file under a slightly different name ("R Kumar" / "Ravi Kumar"):
 *  - in "ask" mode, stays undecided, so their lines wait for a person;
 *  - in the automatic modes, is added like everyone else. The database marks them
 *    "Possible duplicate", so they can be checked or merged later.
 */
export function autoDecisions(reviews: NameReview[], createMissing: boolean, mode: NewPeopleMode = "ask"): NameDecision[] {
  const create = (key: string): NameDecision => ({ name_key: key, decision: "create", profile_id: null, workforce_type: mode === "ask" ? "unknown" : mode });
  return reviews.map((r) => {
    if (r.decision === "link" && r.profile_id) return { name_key: r.name_key, decision: "link", profile_id: r.profile_id };
    if (r.suggested_profile_id) return { name_key: r.name_key, decision: "link", profile_id: r.suggested_profile_id };
    const nearName = (r.candidates?.length ?? 0) > 0;
    if (!createMissing) return { name_key: r.name_key, decision: nearName ? "pending" : "skip", profile_id: null };
    if (nearName && mode === "ask") return { name_key: r.name_key, decision: "pending", profile_id: null };
    return create(r.name_key);
  });
}

/**
 * The People step, filled in from the upload choice. Every line can still be changed by hand
 * before saving; nothing here touches people who were matched.
 */
export function presetPeople(reviews: NameReview[], createMissing: boolean, mode: NewPeopleMode): NameReview[] {
  if (!createMissing || mode === "ask") return reviews;
  return reviews.map((r) => {
    if (r.decision === "create") return { ...r, workforce_type: mode };
    if (r.decision === "pending" && !r.suggested_profile_id && (r.candidates?.length ?? 0) > 0) return { ...r, decision: "create", profile_id: null, workforce_type: mode };
    return r;
  });
}

/** The existing project with the same name (ignoring case, spaces and punctuation), if any. */
export function findProject(label: string, projects: Pick<Project, "id" | "name" | "code">[]): string | null {
  const k = keyOf(label);
  if (!k) return null;
  const hit = projects.find((p) => keyOf(p.name) === k || (p.code && keyOf(p.code) === k));
  return hit?.id ?? null;
}

export type SheetResult = {
  batch: ImportBatch;
  linked: number;
  added: number;
  /** Added although they may already be on file: marked "Possible duplicate". */
  flagged: number;
  addedAs: NewPeopleMode;
  left: number;
  projectsLinked: number;
  projectsCreated: number;
  notes: string[];
};

export class NoBookingsFound extends Error {}

export type AutoOptions = { createMissing: boolean; currency: string; pastEmployees: boolean; isManager: boolean; newPeople?: NewPeopleMode };

/** Reads, checks and imports a workbook / CSV / table PDF in one go. */
export async function autoImportSheets(file: File, kind: "csv" | "xlsx" | "pdf", sheets: SheetInput[], opts: AutoOptions, onStage: (s: string) => void): Promise<SheetResult> {
  const summary = analyzeWorkbook(sheets);
  const lines = summary.lines;
  if (lines.length === 0) throw new NoBookingsFound("No booking lines were found in this file.");
  if (lines.length > MAX_ROWS) throw new Error(`The file has ${lines.length} booking lines. Upload at most ${MAX_ROWS} at a time.`);
  const notes: string[] = [];

  onStage(`Checking ${lines.length} lines`);
  const id = await stageWorkbook(file.name, kind, sheetSummaryForDb(summary).map((s) => ({ ...s, included: true })), lines, opts.createMissing, opts.currency);
  await storeImportFile(id, file, kind).catch(() => notes.push("The original file could not be stored; the lines were still imported."));

  onStage("Matching travellers to employees");
  const reviews = await getNameReviews(id);
  // Only the Travel Desk and the Director say what kind of worker new people are.
  const mode: NewPeopleMode = opts.isManager ? opts.newPeople ?? "ask" : "ask";
  const decisions = autoDecisions(reviews, opts.createMissing, mode);
  const nearNames = new Set(reviews.filter((r) => !r.suggested_profile_id && (r.candidates?.length ?? 0) > 0).map((r) => r.name_key));
  const flagged = decisions.filter((d) => d.decision === "create" && nearNames.has(d.name_key)).length;
  if (decisions.length) await decideNames(id, decisions);
  const linked = decisions.filter((d) => d.decision === "link").length;
  const added = decisions.filter((d) => d.decision === "create").length;
  const left = decisions.filter((d) => d.decision === "skip").length;
  const unsure = decisions.filter((d) => d.decision === "pending").length;

  onStage("Linking project names");
  let projectsLinked = 0;
  let projectsCreated = 0;
  const [uploadProjects, projects] = await Promise.all([getUploadProjects(id), listProjects()]);
  for (const p of uploadProjects) {
    if (p.project_id || !p.label.trim()) continue;
    let projectId = findProject(p.label, projects);
    try {
      if (projectId) {
        projectsLinked++;
      } else {
        projectId = await createProject(p.label.trim(), "project");
        projects.push({ id: projectId, name: p.label.trim(), kind: "project", code: null, status: "active", client: null });
        projectsCreated++;
      }
      await setProjectAlias(p.label, projectId);
    } catch {
      notes.push(`Project "${p.label}" was kept as written (unassigned).`);
    }
  }

  onStage("Saving");
  const batch = await commitWorkbook(id, true);
  if (opts.isManager && opts.createMissing && opts.pastEmployees && batch.created_employees) {
    await markNewPeopleLeft(batch.id).catch(() => notes.push("The new people could not be marked as past employees."));
  }
  if (batch.error_rows) notes.push(`${batch.error_rows} line${batch.error_rows === 1 ? "" : "s"} had errors and were left out; see the upload report.`);
  if (batch.duplicate_rows) notes.push(`${batch.duplicate_rows} line${batch.duplicate_rows === 1 ? " was" : "s were"} already imported earlier.`);
  if (left) notes.push(`${left} traveller${left === 1 ? "" : "s"} not found among employees were left out.`);
  if (unsure) notes.push(`${unsure} traveller${unsure === 1 ? " looks" : "s look"} like someone already on file under a slightly different name, so their lines were left out. Upload the file step by step to decide who they are.`);
  if (flagged) notes.push(`${flagged} new ${flagged === 1 ? "person looks" : "people look"} like someone already on file under a slightly different name. They were added and marked "Possible duplicate": check or merge them on the Temporary Workforce page.`);
  return { batch, linked, added, flagged, addedAs: mode, left, projectsLinked, projectsCreated, notes };
}

export type FiledTicket = AutoResult & { employee: PersonOption; documentId: string };
export type TicketResult = { status: "who"; extraction: Extraction } | FiledTicket;

function docTypeOf(extraction: Extraction): DocumentType {
  const t = extraction.fields.document_type;
  return t && t in DOCUMENT_TYPE_LABELS ? t : "other";
}

/** Files a scanned ticket under an employee and saves the trip when the scan is clear. */
export async function fileTicket(file: File, extraction: Extraction, employee: PersonOption): Promise<FiledTicket> {
  const doc = await uploadDocument(employee.id, file, docTypeOf(extraction));
  await saveScan(doc.id, extraction);
  const result = await autoSaveScan(doc, extraction);
  return { ...result, employee, documentId: doc.id };
}

/** Scans a ticket / invoice / photo, finds whose it is and saves it. */
export async function autoTicket(file: File, people: PersonOption[], onStage: (s: string) => void): Promise<TicketResult> {
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error("The file is larger than 10 MB.");
  onStage("Reading the document");
  const extraction = await scanFile(file);
  const employee = matchPassenger(extraction.fields.passenger_name, people);
  if (!employee) return { status: "who", extraction };
  onStage(`Saving for ${employee.full_name}`);
  return fileTicket(file, extraction, employee);
}

/** For a PDF: tables become an import; anything else is read as a ticket. */
export async function readPdfSheets(file: File): Promise<SheetInput[] | null> {
  try {
    const sheets = await readUploadFile(file, "pdf");
    return analyzeWorkbook(sheets).lines.length > 0 ? sheets : null;
  } catch {
    return null; // a scan or a ticket without tables
  }
}
