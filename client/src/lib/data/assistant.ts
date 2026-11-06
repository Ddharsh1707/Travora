import { getSupabase } from "../supabase";
import { friendlyError } from "./travel";

/**
 * AI assistant. Questions go to the ai-assistant Edge Function, which looks
 * things up with the user's own permissions. Conversations and messages are
 * read straight from the database; RLS only returns the user's own.
 */

export type Conversation = { id: string; title: string | null; created_at: string };
export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; created_at: string; tools_used?: string[] };
export type AskResult = { conversationId: string; answer: string; tools: string[]; saved: boolean };

export const MAX_QUESTION = 2000;

export const EXAMPLE_QUESTIONS: Record<"self" | "team", string[]> = {
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
};

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

export async function renameConversation(id: string, title: string): Promise<void> {
  const t = title.trim().slice(0, 200);
  if (!t) throw new Error("Give the conversation a name.");
  const { error } = await getSupabase().from("ai_conversations").update({ title: t }).eq("id", id);
  if (error) throw friendlyError(error, "Could not rename the conversation.");
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await getSupabase().from("ai_conversations").delete().eq("id", id);
  if (error) throw friendlyError(error, "Could not delete the conversation.");
}
