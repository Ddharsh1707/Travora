// POST /functions/v1/ai-assistant
// Body: { "question": "...", "conversationId": "<uuid>" | null }
//
// Answers travel questions in plain language, for every role.
//
// Security:
//  * The model never sees SQL, keys or the database. It can only ask for one of
//    the fixed tools in _shared/assistantTools.ts. Each tool call is checked in
//    code and then runs a fixed query AS THE CALLER (their JWT), so Row Level
//    Security limits the answer exactly as it limits the screens. Asking the
//    model to "show everyone's trips" cannot widen what the queries return.
//  * Results are trimmed to the fields an answer needs (no emails, no ticket
//    numbers) and capped at MAX_ROWS rows per call.
//  * The service-role key is used for one step only: saving the question and
//    answer through ai_record_exchange(), after the conversation's owner has
//    been checked. Browsers cannot write messages.
//  * Rate limited per user (public.consume_rate_limit 'ai_assistant').
//  * Questions and answers are never written to the function logs.
import Anthropic from "npm:@anthropic-ai/sdk@1.1.0";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { adminClient, getCaller, type Caller } from "../_shared/auth.ts";
import { corsHeaders, fail, json } from "../_shared/http.ts";
import { MAX_ROWS, TOOLS, systemPrompt, trimTrip, validateToolInput, type ValidArgs } from "../_shared/assistantTools.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-opus-5-5";
const MAX_QUESTION = 2000;
const MAX_ROUNDS = 6;
const HISTORY_MESSAGES = 10;
const TRIP_COLUMNS =
  "employee_name, employee_code, department, origin, destination, departure_date, return_date, booking_type, airline_or_provider, booking_reference, amount, currency, status";

type ToolOutput = Record<string, unknown>;

/** Quotes a cleaned term for a PostgREST or() filter. cleanTerm already removed quotes, commas and brackets. */
const like = (term: string) => `"%${term}%"`;

async function trips(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<ToolOutput> {
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  return { count: Math.min(rows.length, MAX_ROWS), truncated: rows.length > MAX_ROWS, trips: rows.slice(0, MAX_ROWS).map(trimTrip) };
}

async function runTool(name: string, a: ValidArgs, caller: Caller): Promise<ToolOutput> {
  const db: SupabaseClient = caller.userClient;
  const base = () => db.from("travel_records_search").select(TRIP_COLUMNS);

  switch (name) {
    case "get_my_travel_history": {
      let q = base().eq("employee_id", caller.profileId);
      if (a.from) q = q.gte("departure_date", a.from);
      if (a.to) q = q.lte("departure_date", a.to);
      return trips(q.order("departure_date", { ascending: false }).limit(MAX_ROWS + 1));
    }
    case "get_employee_travel_history": {
      const t = a.employee!;
      let q = /^[A-Za-z]{2,5}\d{1,8}$/.test(t)
        ? base().eq("employee_code", t.toUpperCase())
        : base().or(`employee_name.ilike.${like(t)},employee_code.ilike.${like(t)}`);
      if (a.from) q = q.gte("departure_date", a.from);
      if (a.to) q = q.lte("departure_date", a.to);
      return trips(q.order("departure_date", { ascending: false }).limit(MAX_ROWS + 1));
    }
    case "get_travel_by_date":
      return trips(base().eq("departure_date", a.date!).order("employee_name").limit(MAX_ROWS + 1));
    case "get_travel_by_date_range": {
      let q = base().gte("departure_date", a.from!).lte("departure_date", a.to!);
      if (a.destination) q = q.ilike("destination", `%${a.destination}%`);
      if (a.mode) q = q.eq("booking_type", a.mode);
      return trips(q.order("departure_date").limit(MAX_ROWS + 1));
    }
    case "search_authorized_travel": {
      const t = like(a.query!);
      const q = base().or(
        [`employee_name.ilike.${t}`, `employee_code.ilike.${t}`, `booking_reference.ilike.${t}`, `origin.ilike.${t}`,
          `destination.ilike.${t}`, `airline_or_provider.ilike.${t}`].join(","),
      );
      return trips(q.order("departure_date", { ascending: false }).limit(MAX_ROWS + 1));
    }
    case "get_pending_approvals": {
      const { data, error } = await db
        .from("travel_requests")
        .select("origin, destination, departure_date, return_date, travel_type, estimated_cost, currency, purpose, created_at, employee:profiles!travel_requests_employee_id_fkey(full_name, employee_id, department)")
        .eq("approver_id", caller.profileId)
        .eq("status", "pending")
        .order("departure_date")
        .limit(MAX_ROWS + 1);
      if (error) throw error;
      const rows = (data ?? []) as Record<string, unknown>[];
      return {
        count: Math.min(rows.length, MAX_ROWS),
        truncated: rows.length > MAX_ROWS,
        requests: rows.slice(0, MAX_ROWS).map((r) => {
          const e = (Array.isArray(r.employee) ? r.employee[0] : r.employee) as Record<string, unknown> | null;
          return {
            employee_name: e?.full_name, employee_code: e?.employee_id, department: e?.department,
            origin: r.origin, destination: r.destination, departure_date: r.departure_date, return_date: r.return_date,
            mode: r.travel_type, estimated_cost: r.estimated_cost, currency: r.currency,
            purpose: typeof r.purpose === "string" ? r.purpose.slice(0, 300) : null, submitted: r.created_at,
          };
        }),
      };
    }
    case "get_monthly_expenses":
    case "get_department_expenses": {
      const { data, error } = await db.rpc("travel_report", { p_from: a.from!, p_to: a.to!, p_department: null, p_mode: null });
      if (error) throw error;
      const r = data as Record<string, unknown>;
      return name === "get_monthly_expenses"
        ? { range: r.range, totals: r.totals, by_month: r.by_month }
        : { range: r.range, totals: r.totals, by_department: r.by_department };
    }
    case "get_bulk_booking": {
      const { data: booking, error } = await db
        .from("bulk_bookings")
        .select("id, title, group_reference, origin, destination, departure_date, return_date, booking_type, provider, total_cost, currency, savings, status, review_status")
        .ilike("group_reference", a.reference!)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!booking) return { found: false };
      const { data: members, error: mError } = await db
        .from("bulk_booking_members")
        .select("seat_or_coach, booking_reference, amount, profile:profiles!bulk_booking_members_employee_id_fkey(full_name, employee_id, department)")
        .eq("bulk_booking_id", booking.id)
        .limit(MAX_ROWS + 1);
      if (mError) throw mError;
      const rows = (members ?? []) as Record<string, unknown>[];
      const { id: _id, ...details } = booking;
      return {
        found: true,
        booking: details,
        travellers_visible: Math.min(rows.length, MAX_ROWS),
        truncated: rows.length > MAX_ROWS,
        travellers: rows.slice(0, MAX_ROWS).map((m) => {
          const p = (Array.isArray(m.profile) ? m.profile[0] : m.profile) as Record<string, unknown> | null;
          return { employee_name: p?.full_name, employee_code: p?.employee_id, department: p?.department, seat_or_coach: m.seat_or_coach, booking_reference: m.booking_reference, amount: m.amount };
        }),
      };
    }
  }
  throw new Error("Unknown tool");
}

const ROLE_LABEL: Record<string, string> = { employee: "employee", approver: "approver", travel_desk: "travel_desk", admin: "admin" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return fail(req, 405, "Method not allowed");

  try {
    const caller = await getCaller(req);
    if (!caller) return fail(req, 401, "Please sign in again");

    let body: { question?: unknown; conversationId?: unknown };
    try {
      body = await req.json();
    } catch {
      return fail(req, 400, "Invalid request");
    }
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) return fail(req, 400, "Type a question first");
    if (question.length > MAX_QUESTION) return fail(req, 400, `Keep questions under ${MAX_QUESTION} characters`);
    const givenId = body.conversationId ?? null;
    if (givenId !== null && (typeof givenId !== "string" || !UUID.test(givenId))) return fail(req, 400, "Invalid request");

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return fail(req, 503, "The assistant is not set up yet", "ANTHROPIC_API_KEY missing");

    const { data: allowed, error: limitError } = await caller.userClient.rpc("consume_rate_limit", { p_bucket: "ai_assistant" });
    if (limitError) return fail(req, 500, "Something went wrong", limitError);
    if (!allowed) return fail(req, 429, "You have asked a lot of questions today. Try again tomorrow.");

    // The conversation must be the caller's own (RLS hides everyone else's).
    let conversationId: string;
    const history: Anthropic.Beta.BetaMessageParam[] = [];
    if (givenId) {
      const { data: conv } = await caller.userClient.from("ai_conversations").select("id").eq("id", givenId).maybeSingle();
      if (!conv) return fail(req, 404, "Conversation not found");
      conversationId = conv.id;
      const { data: past } = await caller.userClient
        .from("ai_messages")
        .select("role, content")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(HISTORY_MESSAGES);
      for (const m of (past ?? []).reverse()) {
        if (m.role !== "user" && m.role !== "assistant") continue;
        // Keep user/assistant turns alternating, starting with the user.
        if (history.length === 0 && m.role !== "user") continue;
        if (history.length && history[history.length - 1].role === m.role) continue;
        history.push({ role: m.role, content: m.content });
      }
      if (history.length && history[history.length - 1].role === "user") history.pop();
    } else {
      const { data: conv, error } = await caller.userClient.from("ai_conversations").insert({}).select("id").single();
      if (error || !conv) return fail(req, 500, "Could not start a conversation", error);
      conversationId = conv.id;
    }

    const { data: me } = await caller.userClient.from("profiles").select("full_name").eq("id", caller.profileId).maybeSingle();
    const system = systemPrompt({
      name: me?.full_name ?? "a colleague",
      role: ROLE_LABEL[caller.role] ?? "employee",
      today: new Date().toISOString().slice(0, 10),
    });

    const messages: Anthropic.Beta.BetaMessageParam[] = [...history, { role: "user", content: question }];
    const tools = TOOLS.map((t) => ({ ...t, strict: true })) as unknown as Anthropic.Beta.BetaToolUnion[];
    const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
    const used: string[] = [];
    let answer = "";

    for (let round = 0; round < MAX_ROUNDS; round++) {
      let response: Anthropic.Beta.BetaMessage;
      try {
        response = await client.beta.messages.create({
          model: MODEL,
          max_tokens: 2000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system,
          tools,
          tool_choice: { type: "auto" },
          output_config: { effort: "low" },
          messages,
        });
      } catch (err) {
        if (err instanceof Anthropic.RateLimitError) return fail(req, 503, "The assistant is busy. Try again in a minute.", err);
        return fail(req, 502, "The assistant could not answer right now", err);
      }

      if (response.stop_reason === "refusal") {
        answer = "I can't help with that one. Try asking about trips, travel spend, requests or approvals.";
        break;
      }
      const toolCalls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || toolCalls.length === 0) {
        answer = response.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.Beta.BetaTextBlock).text).join("\n").trim();
        if (response.stop_reason === "max_tokens") answer += "\n\n(The answer was cut short. Try a narrower question.)";
        break;
      }

      // Pass the assistant turn back unchanged, then one result per tool call.
      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const call of toolCalls) {
        const checked = validateToolInput(call.name, call.input);
        if (!checked.ok) {
          results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: checked.error });
          continue;
        }
        if (used.length < 20) used.push(call.name);
        try {
          const out = await runTool(call.name, checked.args, caller);
          results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(out) });
        } catch (err) {
          console.error("assistant tool failed", call.name, err instanceof Error ? err.message : "error");
          results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: "The records could not be read." });
        }
      }
      messages.push({ role: "user", content: results });
    }

    if (!answer) answer = "I could not finish looking that up. Try asking a narrower question, for example one person or one month.";
    answer = answer.slice(0, 20000);

    const { error: saveError } = await adminClient().rpc("ai_record_exchange", {
      p_user: caller.userId,
      p_conversation: conversationId,
      p_question: question,
      p_answer: answer,
      p_tools: used,
    });
    if (saveError) console.error("Could not save the conversation", saveError.message);

    return json(req, 200, { conversationId, answer, tools: used, saved: !saveError });
  } catch (err) {
    return fail(req, 500, "Something went wrong", err);
  }
});
