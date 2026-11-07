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
import { MANAGER_TOOL_NAMES, MAX_ROWS, systemPrompt, toolsFor, trimSpend, trimTrip, validateToolInput, type ValidArgs } from "../_shared/assistantTools.ts";

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

const SPEND_COLUMNS =
  "spend_date, source, entered_by, employee_id, employee_name, employee_code, department, category, description, project_id, project_name, origin, destination, booking_reference, amount, currency, counted, status";

type Person = { id: string; full_name: string; employee_id: string; department: string | null };

/** Finds people the caller can see by name or employee ID. An exact ID or name wins. */
async function findPeople(db: SupabaseClient, term: string): Promise<Person[]> {
  const { data, error } = await db.from("profiles")
    .select("id, full_name, employee_id, department")
    .or(`full_name.ilike.${like(term)},employee_id.ilike.${like(term)}`)
    .order("full_name")
    .limit(10);
  if (error) throw error;
  const rows = (data ?? []) as Person[];
  const exact = rows.filter((p) => p.employee_id.toLowerCase() === term.toLowerCase() || p.full_name.toLowerCase() === term.toLowerCase());
  return exact.length ? exact : rows;
}

/** Resolves a person filter: one match → their id; none or several → an answer for the model instead. */
async function onePerson(db: SupabaseClient, term: string | undefined): Promise<{ id?: string; stop?: ToolOutput }> {
  if (!term) return {};
  const people = await findPeople(db, term);
  if (people.length === 0) return { stop: { found: false, note: `No employee the user can see matches "${term}".` } };
  if (people.length > 1) return { stop: { found: false, ambiguous: true, candidates: people.map(({ id: _id, ...p }) => p) } };
  return { id: people[0].id };
}

async function oneProject(db: SupabaseClient, term: string | null | undefined): Promise<{ id?: string; name?: string; stop?: ToolOutput }> {
  if (!term) return {};
  const { data, error } = await db.from("projects").select("id, name, code").or(`name.ilike.${like(term)},code.ilike.${like(term)}`).limit(10);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; name: string; code: string | null }>;
  const exact = rows.filter((p) => p.name.toLowerCase() === term.toLowerCase() || (p.code ?? "").toLowerCase() === term.toLowerCase());
  const hits = exact.length ? exact : rows;
  if (hits.length === 0) return { stop: { found: false, note: `No project matches "${term}".` } };
  if (hits.length > 1) return { stop: { found: false, ambiguous: true, candidates: hits.map((p) => ({ name: p.name, code: p.code })) } };
  return { id: hits[0].id, name: hits[0].name };
}

async function summary(db: SupabaseClient, p: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await db.rpc("spend_summary", { p });
  if (error) throw error;
  return data as Record<string, unknown>;
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
    case "get_person_profile": {
      const people = await findPeople(db, a.employee!);
      if (people.length === 0) return { found: false, note: `No employee the user can see matches "${a.employee}".` };
      if (people.length > 1) return { found: false, ambiguous: true, candidates: people.map(({ id: _id, ...p }) => p) };
      const id = people[0].id;
      const { data: prof, error } = await db.from("profiles")
        .select("full_name, employee_id, department, designation, role, active, created_at, manager:profiles!profiles_manager_id_fkey(full_name, employee_id)")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      const range = { from: a.from ?? null, to: a.to ?? null, employee: id };
      const [totals, byProject, byCategory, byMonth, byStatus, recent] = await Promise.all([
        summary(db, { ...range, group_by: "source" }),
        summary(db, { ...range, group_by: "project" }),
        summary(db, { ...range, group_by: "category" }),
        summary(db, { ...range, group_by: "month" }),
        summary(db, { ...range, group_by: "status" }),
        (async () => {
          let q = db.from("spend_items").select(SPEND_COLUMNS).eq("employee_id", id);
          if (a.from) q = q.gte("spend_date", a.from);
          if (a.to) q = q.lte("spend_date", a.to);
          const { data, error: e } = await q.order("spend_date", { ascending: false }).limit(25);
          if (e) throw e;
          return (data ?? []) as Record<string, unknown>[];
        })(),
      ]);
      const m = prof ? (Array.isArray(prof.manager) ? prof.manager[0] : prof.manager) as Record<string, unknown> | null : null;
      return {
        found: true,
        profile: prof ? { name: prof.full_name, employee_id: prof.employee_id, department: prof.department, designation: prof.designation,
          role: prof.role, active: prof.active, manager: m ? `${m.full_name} (${m.employee_id})` : null } : null,
        period: { from: a.from ?? "all dates", to: a.to ?? "all dates" },
        totals: totals.totals,
        by_source: totals.groups,
        by_project: (byProject.groups as unknown[]).slice(0, 15),
        by_category: byCategory.groups,
        by_month: byMonth.groups,
        by_status: byStatus.groups,
        latest_records: recent.map(trimSpend),
      };
    }
    case "find_spend": {
      const person = await onePerson(db, a.employee);
      if (person.stop) return person.stop;
      const project = await oneProject(db, a.project);
      if (project.stop) return project.stop;
      let q = db.from("spend_items").select(SPEND_COLUMNS);
      if (person.id) q = q.eq("employee_id", person.id);
      if (project.id) q = q.eq("project_id", project.id);
      if (a.category) q = q.eq("category", a.category);
      if (a.source) q = q.eq("source", a.source);
      if (a.status) q = q.eq("status", a.status);
      if (a.from) q = q.gte("spend_date", a.from);
      if (a.to) q = q.lte("spend_date", a.to);
      const [{ data, error }, totals] = await Promise.all([
        q.order("spend_date", { ascending: false }).limit(MAX_ROWS + 1),
        summary(db, { from: a.from ?? null, to: a.to ?? null, employee: person.id ?? null, project: project.id ?? null,
          category: a.category ?? null, source: a.source ?? null, status: a.status ?? null, group_by: "none" }),
      ]);
      if (error) throw error;
      const rows = (data ?? []) as Record<string, unknown>[];
      return {
        totals_for_all_matching_records: totals.totals,
        shown: Math.min(rows.length, MAX_ROWS),
        truncated: rows.length > MAX_ROWS,
        records: rows.slice(0, MAX_ROWS).map(trimSpend),
      };
    }
    case "spend_summary": {
      const person = await onePerson(db, a.employee);
      if (person.stop) return person.stop;
      const project = await oneProject(db, a.project);
      if (project.stop) return project.stop;
      const s = await summary(db, { from: a.from ?? null, to: a.to ?? null, group_by: a.group_by, employee: person.id ?? null,
        project: project.id ?? null, source: a.source ?? null });
      return { ...s, groups: (s.groups as unknown[]).slice(0, 100) };
    }
    case "list_uploads": {
      const { data, error } = await db.rpc("import_history", { p_limit: 200, p_offset: 0 });
      if (error) throw error;
      const rows = ((data ?? []) as Record<string, unknown>[]).filter((r) => {
        const d = String(r.created_at ?? "").slice(0, 10);
        return (!a.from || d >= a.from) && (!a.to || d <= a.to);
      });
      return {
        count: Math.min(rows.length, MAX_ROWS),
        truncated: rows.length > MAX_ROWS,
        uploads: rows.slice(0, MAX_ROWS).map((r) => ({
          file: r.original_filename, uploaded_by: r.uploaded_by, uploaded_on: String(r.created_at).slice(0, 10), status: r.status,
          rows: r.total_rows, imported_rows: r.imported_rows, error_rows: r.error_rows, trips: r.trips, spend: r.spend,
          original_file_stored: !!r.file_path,
        })),
      };
    }
  }
  throw new Error("Unknown tool");
}

/** The rows behind an answer, for the "records used" panel. Same trimmed fields the model saw. */
function recordsFrom(name: string, out: ToolOutput): { tool: string; rows: Record<string, unknown>[] } | null {
  const rows = (out.trips ?? out.records ?? out.latest_records ?? out.requests ?? out.uploads ?? out.travellers ?? out.groups ?? out.by_month ?? out.by_department ?? out.candidates) as unknown;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return { tool: name, rows: rows.slice(0, MAX_ROWS) as Record<string, unknown>[] };
}

const ROLE_LABEL: Record<string, string> = { employee: "employee", approver: "approver", travel_desk: "travel_desk", company_admin: "company_admin", admin: "admin" };

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
    const role = ROLE_LABEL[caller.role] ?? "employee";
    const isManager = role === "admin" || role === "company_admin";
    const tools = toolsFor(role).map((t) => ({ ...t, strict: true })) as unknown as Anthropic.Beta.BetaToolUnion[];
    const records: Array<{ tool: string; rows: Record<string, unknown>[] }> = [];
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
        if (MANAGER_TOOL_NAMES.has(call.name) && !isManager) {
          results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: "This tool is only for the Admin and the CEO." });
          continue;
        }
        if (used.length < 20) used.push(call.name);
        try {
          const out = await runTool(call.name, checked.args, caller);
          const rec = recordsFrom(call.name, out);
          if (rec && records.length < 8) records.push(rec);
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

    return json(req, 200, { conversationId, answer, tools: used, records, saved: !saveError });
  } catch (err) {
    return fail(req, 500, "Something went wrong", err);
  }
});
