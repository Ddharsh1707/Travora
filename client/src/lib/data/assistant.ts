import { getSupabase } from "../supabase";
import { friendlyError } from "./travel";

/**
 * AI assistant. Questions go to the ai-assistant Edge Function, which looks
 * things up with the user's own permissions. Conversations and messages are
 * read straight from the database; RLS only returns the user's own.
 */

export type Conversation = { id: string; title: string | null; created_at: string };
export type RecordSet = { tool: string; rows: Array<Record<string, unknown>> };
export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; created_at: string; tools_used?: string[]; records?: RecordSet[] };
export type AskResult = { conversationId: string; answer: string; tools: string[]; records?: RecordSet[]; provider?: string; saved: boolean };

export const MAX_QUESTION = 2000;

export const EXAMPLE_QUESTIONS: Record<"self" | "team" | "manager", string[]> = {
  manager: [
    "Give me a company overview for this month",
    "List all pending travel requests",
    "Which employees have no login yet?",
    "Which approved requests still have no ticket?",
    "How much did Ravi spend in September?",
    "Show all trips for project HRRL",
    "Who spent the most this month, claims and trips together?",
    "Weekly spend for the last 4 weeks",
    "Which Excel sheets were uploaded this month?",
    "Which expense claims are waiting for review?",
  ],
  self: [
    "Where am I travelling next?",
    "Show my trips from the last three months",
    "How much did my travel cost this financial year?",
  ],
  team: [
    "Who is travelling to Mumbai next week?",
    "Which requests are waiting for my approval?",
    "Show travel spend by department this quarter",
    "Who travelled on 14 October?",
  ],
};

/** Readable names for the lookups the assistant made, shown under an answer. */
export const TOOL_LABELS: Record<string, string> = {
  get_my_travel_history: "your trips",
  get_employee_travel_history: "an employee's trips",
  get_travel_by_date: "trips on a date",
  get_travel_by_date_range: "trips in a date range",
  get_pending_approvals: "your pending approvals",
  get_monthly_expenses: "monthly spend",
  get_department_expenses: "department spend",
  search_authorized_travel: "travel search",
  get_bulk_booking: "a group booking",
  get_person_profile: "an employee's profile and spend",
  find_spend: "claims and trips",
  spend_summary: "spend totals",
  list_uploads: "uploaded Excel sheets",
  company_overview: "company overview",
  list_employees: "employees",
  list_travel_requests: "travel requests",
  list_tickets: "tickets",
  list_projects: "projects",
};

/** Column headings for the records panel; unknown keys are shown as they are. */
export const RECORD_COLUMN_LABELS: Record<string, string> = {
  spend_date: "Date", departure_date: "Date", source: "Source", entered_by: "Entered by", employee_name: "Employee", employee_code: "ID",
  department: "Department", category: "Category", description: "Description", project_name: "Project", origin: "From", destination: "To",
  booking_reference: "PNR", booking_type: "Mode", airline_or_provider: "Provider", amount: "Amount", currency: "Cur.", counted: "Counted",
  status: "Status", group: "Group", records: "Records", counted_amount: "Total", claims: "Claims", trips: "Trips", people: "People",
  file: "File", uploaded_by: "Uploaded by", uploaded_on: "Uploaded", spend: "Spend", rows: "Rows",
  designation: "Designation", role: "Role", employment: "Current / past", has_login: "Has login", manager: "Manager", added_on: "Added",
  return_date: "Return", mode: "Mode", estimated_cost: "Est. cost", hotel: "Hotel", purpose: "Purpose", submitted: "Submitted",
  decided_by: "Decided by", decided_on: "Decided", decision_comment: "Comment", ticket_attached: "Ticket", ticket_type: "Ticket type",
  request_status: "Request status", attached_on: "Attached", code: "Code", kind: "Kind", client: "Client", site: "Site",
  start_date: "Start", end_date: "End", imported_rows: "Imported", error_rows: "Errors",
};

/** The columns to show for a set of records: the keys that have a value in any row, in first-seen order. */
export function recordColumns(rows: Array<Record<string, unknown>>): string[] {
  const cols: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k) && r[k] !== null && r[k] !== undefined && typeof r[k] !== "object") cols.push(k);
  return cols.slice(0, 12);
}

export function toolSummary(tools: string[] | undefined): string {
  const names = Array.from(new Set(tools ?? [])).map((t) => TOOL_LABELS[t] ?? "records");
  return names.length ? `Looked up: ${names.join(", ")}` : "";
}

export function questionError(question: string): string | null {
  const q = question.trim();
  if (!q) return "Type a question first.";
  if (q.length > MAX_QUESTION) return `Keep questions under ${MAX_QUESTION} characters.`;
  return null;
}

export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await getSupabase()
    .from("ai_conversations")
    .select("id, title, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw friendlyError(error, "Could not load your conversations.");
  return (data ?? []) as Conversation[];
}

export async function getMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await getSupabase()
    .from("ai_messages")
    .select("id, role, content, created_at, tools_used")
    .eq("conversation_id", conversationId)
    .in("role", ["user", "assistant"])
    .order("created_at")
    .limit(200);
  if (error) throw friendlyError(error, "Could not load this conversation.");
  return (data ?? []) as ChatMessage[];
}

export async function ask(question: string, conversationId: string | null): Promise<AskResult> {
  const problem = questionError(question);
  if (problem) throw new Error(problem);
  const { data, error } = await getSupabase().functions.invoke("ai-assistant", { body: { question: question.trim(), conversationId } });
  if (error) {
    let message = "The assistant could not answer right now.";
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body && typeof body.error === "string") message = body.error;
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }
  return data as AskResult;
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await getSupabase().from("ai_conversations").delete().eq("id", id);
  if (error) throw friendlyError(error, "Could not delete the conversation.");
}
