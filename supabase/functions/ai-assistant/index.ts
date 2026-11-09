// POST /functions/v1/ai-assistant
// Body: { "question": "...", "conversationId": "<uuid>" | null }
//
// Answers travel questions in plain language, for every role.
//
// AI providers (set one or more keys as Supabase secrets; the first one set is
// used, the others are a backup if it is busy):
//   GROQ_API_KEY       free tier, Groq does not train on your data (recommended)
//   GEMINI_API_KEY     Google AI Studio free tier (Google may use free-tier data)
//   ANTHROPIC_API_KEY  Claude (paid)
// AI_PROVIDER = groq | gemini | anthropic picks the first one to try.
// GROQ_MODEL, GEMINI_MODEL, ANTHROPIC_MODEL change the model.
//
// Security:
//  * The model never sees SQL, keys or the database. It can only ask for one of
//    the fixed tools in _shared/assistantTools.ts. Each tool call is checked in
//    code and then runs a fixed query AS THE CALLER (their JWT), so Row Level
//    Security limits the answer exactly as it limits the screens. Asking the
//    model to "show everyone's trips" cannot widen what the queries return.
//  * Results are trimmed to the fields an answer needs (no emails, no ticket
//    numbers) and capped per call (the model reads at most MODEL_ROWS of each list).
//  * The service-role key is used for one step only: saving the question and
//    answer through ai_record_exchange(), after the conversation's owner has
//    been checked. Browsers cannot write messages.
//  * Rate limited per user (public.consume_rate_limit 'ai_assistant').
//  * Questions and answers are never written to the function logs.
import Anthropic from "npm:@anthropic-ai/sdk@1.1.0";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { adminClient, getCaller, type Caller } from "../_shared/auth.ts";
import { corsHeaders, fail, json } from "../_shared/http.ts";
import {
  fillOptional, forModel, MANAGER_TOOL_NAMES, systemPrompt, toOpenAITool, toolsFor, trimSpend, trimTrip, validateToolInput, type ValidArgs,
} from "../_shared/assistantTools.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-opus-5-5";
/** Rows read per lookup. All of them go to the download buttons. */
const MAX_ROWS = 999; // Supabase returns at most 1000 rows, so 999 + 1 still tells us if there were more.
/** Rows of each list the model reads. Free models have small token limits. */
const MODEL_ROWS = { anthropic: 50, openai: 20 };
/** Most rows sent back to the browser for one answer. */
const MAX_RECORD_ROWS = 3000;
const MAX_QUESTION = 2000;
const MAX_ROUNDS = 6;
const HISTORY_MESSAGES = 10;
const TRIP_COLUMNS =
  "employee_name, employee_code, department, origin, destination, departure_date, return_date, booking_type, airline_or_provider, booking_reference, amount, currency, status";

type ToolOutput = Record<string, unknown>;

const REQUEST_STATUS_LIST = ["pending", "approved", "rejected", "cancelled", "booked", "completed"];
const ROLE_TEXT: Record<string, string> = { admin: "Director", company_admin: "Travel Desk", travel_desk: "Booking assistant", approver: "Approver", employee: "Employee" };
const DECIDER_TEXT: Record<string, string> = { CEO: "Director", Admin: "Travel Desk", Manager: "Manager" };

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
    case "company_overview": {
      const today = new Date().toISOString().slice(0, 10);
      const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
      const fyStart = `${m >= 4 ? y : y - 1}-04-01`;
      const head = (t: string) => db.from(t).select("id", { count: "exact", head: true });
      const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
        const { count: c, error } = await q;
        if (error) throw error;
        return c ?? 0;
      };
      const [current, past, logins, tickets, projects, ...requests] = await Promise.all([
        count(head("profiles").eq("active", true)),
        count(head("profiles").eq("active", false)),
        count(head("profiles").eq("active", true).not("user_id", "is", null)),
        count(head("documents").not("travel_request_id", "is", null)),
        count(head("projects")),
        ...REQUEST_STATUS_LIST.map((st) => count(head("travel_requests").eq("status", st))),
      ]);
      const [month, fy, uploads] = await Promise.all([
        summary(db, { from: `${today.slice(0, 8)}01`, to: today, group_by: "source" }),
        summary(db, { from: fyStart, to: today, group_by: "source" }),
        db.rpc("import_history", { p_limit: 200, p_offset: 0 }).then(({ data, error }) => {
          if (error) throw error;
          return ((data ?? []) as unknown[]).length;
        }),
      ]);
      return {
        today,
        employees: { current, past, current_with_login: logins },
        travel_requests_by_status: Object.fromEntries(REQUEST_STATUS_LIST.map((st, i) => [st, requests[i]])),
        tickets_attached: tickets,
        projects,
        excel_uploads: uploads,
        spend_this_month: { totals: month.totals, by_source: month.groups },
        spend_this_financial_year: { from: fyStart, totals: fy.totals, by_source: fy.groups },
      };
    }
    case "list_employees": {
      let q = db.from("profiles")
        .select("full_name, employee_id, department, designation, role, active, user_id, created_at, manager:profiles!profiles_manager_id_fkey(full_name, employee_id)");
      if (a.employee_status === "current") q = q.eq("active", true);
      if (a.employee_status === "past") q = q.eq("active", false);
      if (a.department) q = q.ilike("department", `%${a.department}%`);
      if (a.role) q = q.eq("role", a.role);
      if (a.search) q = q.or(`full_name.ilike.${like(a.search)},employee_id.ilike.${like(a.search)}`);
      const { data, error } = await q.order("full_name").limit(MAX_ROWS + 1);
      if (error) throw error;
      const rows = (data ?? []) as Record<string, unknown>[];
      return {
        count: Math.min(rows.length, MAX_ROWS),
        truncated: rows.length > MAX_ROWS,
        employees: rows.slice(0, MAX_ROWS).map((r) => {
          const mgr = (Array.isArray(r.manager) ? r.manager[0] : r.manager) as Record<string, unknown> | null;
          return {
            employee_name: r.full_name, employee_code: r.employee_id, department: r.department, designation: r.designation,
            role: ROLE_TEXT[String(r.role)] ?? r.role, employment: r.active ? "current" : "past", has_login: !!r.user_id,
            manager: mgr ? `${mgr.full_name} (${mgr.employee_id})` : null, added_on: String(r.created_at ?? "").slice(0, 10),
          };
        }),
      };
    }
    case "list_travel_requests": {
      const person = await onePerson(db, a.employee ?? undefined);
      if (person.stop) return person.stop;
      let q = db.from("travel_requests")
        .select("id, origin, destination, departure_date, return_date, travel_type, project_name, estimated_cost, currency, status, purpose, created_at, decided_by_name, decided_by_role, decided_at, decision_comment, hotel_required, hotel_city, employee:profiles!travel_requests_employee_id_fkey(full_name, employee_id, department)");
      if (person.id) q = q.eq("employee_id", person.id);
      if (a.request_status) q = q.eq("status", a.request_status);
      if (a.project) q = q.ilike("project_name", `%${a.project}%`);
      if (a.from) q = q.gte("departure_date", a.from);
      if (a.to) q = q.lte("departure_date", a.to);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(MAX_ROWS + 1);
      if (error) throw error;
      const rows = ((data ?? []) as Record<string, unknown>[]).slice(0, MAX_ROWS);
      const withTicket = new Set<string>();
      const ids = rows.map((r) => String(r.id));
      for (let i = 0; i < ids.length; i += 150) {
        const { data: docs, error: dErr } = await db.from("documents").select("travel_request_id").in("travel_request_id", ids.slice(i, i + 150));
        if (dErr) throw dErr;
        for (const d of (docs ?? []) as Array<{ travel_request_id: string }>) withTicket.add(d.travel_request_id);
      }
      const byStatus: Record<string, number> = {};
      let estimated = 0;
      for (const r of rows) {
        byStatus[String(r.status)] = (byStatus[String(r.status)] ?? 0) + 1;
        estimated += Number(r.estimated_cost ?? 0);
      }
      return {
        count: rows.length,
        truncated: ((data ?? []) as unknown[]).length > MAX_ROWS,
        by_status: byStatus,
        total_estimated_cost: Math.round(estimated * 100) / 100,
        requests: rows.map((r) => {
          const e = (Array.isArray(r.employee) ? r.employee[0] : r.employee) as Record<string, unknown> | null;
          return {
            employee_name: e?.full_name, employee_code: e?.employee_id, department: e?.department,
            origin: r.origin, destination: r.destination, departure_date: r.departure_date, return_date: r.return_date,
            mode: r.travel_type, project_name: r.project_name, estimated_cost: r.estimated_cost, currency: r.currency, status: r.status,
            hotel: r.hotel_required ? (r.hotel_city ?? "yes") : null,
            purpose: typeof r.purpose === "string" ? r.purpose.slice(0, 200) : null,
            submitted: String(r.created_at ?? "").slice(0, 10),
            decided_by: r.decided_by_name ? `${r.decided_by_name}${r.decided_by_role ? ` (${DECIDER_TEXT[String(r.decided_by_role)] ?? r.decided_by_role})` : ""}` : null,
            decided_on: r.decided_at ? String(r.decided_at).slice(0, 10) : null,
            decision_comment: typeof r.decision_comment === "string" ? r.decision_comment.slice(0, 200) : null,
            ticket_attached: withTicket.has(String(r.id)),
          };
        }),
      };
    }
    case "list_tickets": {
      const person = await onePerson(db, a.employee ?? undefined);
      if (person.stop) return person.stop;
      let q = db.from("documents")
        .select("original_filename, document_type, created_at, employee:profiles!documents_employee_id_fkey(full_name, employee_id, department), request:travel_requests!documents_travel_request_id_fkey(origin, destination, departure_date, status)")
        .not("travel_request_id", "is", null);
      if (person.id) q = q.eq("employee_id", person.id);
      if (a.from) q = q.gte("created_at", a.from);
      if (a.to) q = q.lte("created_at", `${a.to}T23:59:59.999Z`);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(MAX_ROWS + 1);
      if (error) throw error;
      const rows = (data ?? []) as Record<string, unknown>[];
      return {
        count: Math.min(rows.length, MAX_ROWS),
        truncated: rows.length > MAX_ROWS,
        tickets: rows.slice(0, MAX_ROWS).map((r) => {
          const e = (Array.isArray(r.employee) ? r.employee[0] : r.employee) as Record<string, unknown> | null;
          const t = (Array.isArray(r.request) ? r.request[0] : r.request) as Record<string, unknown> | null;
          return {
            employee_name: e?.full_name, employee_code: e?.employee_id, department: e?.department,
            file: r.original_filename, ticket_type: String(r.document_type ?? "").replace(/_/g, " "),
            origin: t?.origin, destination: t?.destination, departure_date: t?.departure_date, request_status: t?.status,
            attached_on: String(r.created_at ?? "").slice(0, 10),
          };
        }),
      };
    }
    case "list_projects": {
      let q = db.from("projects").select("name, code, kind, client, site, status, start_date, end_date");
      if (a.search) q = q.or(`name.ilike.${like(a.search)},code.ilike.${like(a.search)}`);
      const { data, error } = await q.order("name").limit(MAX_ROWS + 1);
      if (error) throw error;
      const rows = (data ?? []) as Record<string, unknown>[];
      return {
        count: Math.min(rows.length, MAX_ROWS),
        truncated: rows.length > MAX_ROWS,
        projects: rows.slice(0, MAX_ROWS).map((r) => ({
          project_name: r.name, code: r.code, kind: r.kind, client: r.client, site: r.site, status: r.status, start_date: r.start_date, end_date: r.end_date,
        })),
      };
    }
  }
  throw new Error("Unknown tool");
}

/** The rows behind an answer, for the "records used" panel. Same trimmed fields the model saw. */
function recordsFrom(name: string, out: ToolOutput): { tool: string; rows: Record<string, unknown>[] } | null {
  const rows = (out.trips ?? out.records ?? out.latest_records ?? out.requests ?? out.uploads ?? out.travellers ?? out.employees ?? out.tickets ?? out.projects
    ?? out.groups ?? out.by_month ?? out.by_department ?? out.candidates) as unknown;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return { tool: name, rows: rows.slice(0, MAX_ROWS) as Record<string, unknown>[] };
}

const ROLE_LABEL: Record<string, string> = { employee: "employee", approver: "approver", travel_desk: "travel_desk", company_admin: "company_admin", admin: "admin" };

// ---------------------------------------------------------------------------
// AI providers
// ---------------------------------------------------------------------------

type ProviderId = "groq" | "gemini" | "anthropic";
type Provider = { id: ProviderId; key: string; model: string };
type Turn = { role: "user" | "assistant"; content: string };
type ToolRunner = (name: string, input: unknown, modelRows: number) => Promise<{ content: string; isError: boolean }>;
type LoopResult = { answer: string } | { busy: true; error: unknown } | { failed: true; error: unknown };

const OPENAI_COMPAT: Record<"groq" | "gemini", { url: string; model: string }> = {
  groq: { url: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.3-70b-versatile" },
  gemini: { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", model: "gemini-2.5-flash" },
};

/** The providers that have a key, AI_PROVIDER first, then groq, gemini, anthropic. */
function providers(): Provider[] {
  const all: Provider[] = [];
  const add = (id: ProviderId, keyName: string, modelName: string, fallback: string) => {
    const key = Deno.env.get(keyName);
    if (key) all.push({ id, key, model: Deno.env.get(modelName) || fallback });
  };
  add("groq", "GROQ_API_KEY", "GROQ_MODEL", OPENAI_COMPAT.groq.model);
  add("gemini", "GEMINI_API_KEY", "GEMINI_MODEL", OPENAI_COMPAT.gemini.model);
  add("anthropic", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", ANTHROPIC_MODEL);
  const first = (Deno.env.get("AI_PROVIDER") ?? "").toLowerCase();
  return all.sort((a, b) => Number(b.id === first) - Number(a.id === first));
}

const REFUSED = "I can't help with that one. Try asking about trips, spend, employees, requests, tickets or uploads.";

/** Groq and Gemini: OpenAI-style chat completions with function calling. */
async function runOpenAICompat(p: Provider, system: string, history: Turn[], question: string, tools: ReturnType<typeof toolsFor>, run: ToolRunner): Promise<LoopResult> {
  const url = OPENAI_COMPAT[p.id as "groq" | "gemini"].url;
  const fnTools = tools.map(toOpenAITool);
  const messages: Record<string, unknown>[] = [{ role: "system", content: system }, ...history, { role: "user", content: question }];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const payload = JSON.stringify({
      model: p.model, messages, tools: fnTools, max_tokens: 3000, temperature: 0.1,
      // On the last round, ask for words instead of more lookups.
      tool_choice: round === MAX_ROUNDS - 1 ? "none" : "auto",
    });
    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Authorization": `Bearer ${p.key}`, "Content-Type": "application/json" },
          body: payload,
          signal: AbortSignal.timeout(60_000),
        });
      } catch (err) {
        return { failed: true, error: err };
      }
      if (res.status === 429) {
        // Free tiers limit tokens per minute. Wait if the provider says it is a short wait.
        const wait = Number(res.headers.get("retry-after") ?? "");
        if (attempt < 2 && Number.isFinite(wait) && wait > 0 && wait <= 20) {
          await res.body?.cancel();
          await new Promise((r) => setTimeout(r, wait * 1000));
          continue;
        }
        return { busy: true, error: `${p.id} 429` };
      }
      if (res.status === 503) return { busy: true, error: `${p.id} 503` };
      if (res.status === 400 && attempt < 2) {
        // Groq answers 400 tool_use_failed when the model wrote a broken tool call; asking again usually works.
        const text = await res.text().catch(() => "");
        if (text.includes("tool_use_failed")) continue;
        return { failed: true, error: `${p.id} 400 ${text.slice(0, 300)}` };
      }
      break;
    }
    if (!res) return { failed: true, error: `${p.id} no response` };
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      return { failed: true, error: `${p.id} ${res.status} ${detail}` };
    }
    const body = await res.json() as { choices?: Array<{ finish_reason?: string; message?: Record<string, unknown> }> };
    const choice = body.choices?.[0];
    const msg = choice?.message;
    if (!msg) return { failed: true, error: `${p.id} returned no message` };
    const calls = (Array.isArray(msg.tool_calls) ? msg.tool_calls : []) as Array<{ id: string; function?: { name?: string; arguments?: string } }>;
    if (calls.length === 0) {
      let answer = typeof msg.content === "string" ? msg.content.trim() : "";
      if (choice?.finish_reason === "content_filter") answer = REFUSED;
      if (choice?.finish_reason === "length") answer += "\n\n(The answer was cut short. Try a narrower question.)";
      return { answer };
    }
    // Send the assistant turn back unchanged (Gemini needs its signatures), then one result per call.
    messages.push(msg);
    for (const call of calls.slice(0, 8)) {
      let input: unknown = null;
      try {
        input = JSON.parse(call.function?.arguments || "{}");
      } catch {
        input = null;
      }
      const name = call.function?.name ?? "";
      const out = await run(name, fillOptional(name, input), MODEL_ROWS.openai);
      messages.push({ role: "tool", tool_call_id: call.id, content: out.isError ? `Error: ${out.content}` : out.content });
    }
    for (const call of calls.slice(8)) messages.push({ role: "tool", tool_call_id: call.id, content: "Error: too many lookups at once" });
  }
  return { answer: "" };
}

/** Claude, through the Anthropic SDK. */
async function runAnthropic(p: Provider, system: string, history: Turn[], question: string, tools: ReturnType<typeof toolsFor>, run: ToolRunner): Promise<LoopResult> {
  const client = new Anthropic({ apiKey: p.key, maxRetries: 2, timeout: 60_000 });
  const messages: Anthropic.Beta.BetaMessageParam[] = [...history, { role: "user", content: question }];
  const strictTools = tools.map((t) => ({ ...t, strict: true })) as unknown as Anthropic.Beta.BetaToolUnion[];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.create({
        model: p.model,
        max_tokens: 2000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system,
        tools: strictTools,
        tool_choice: { type: "auto" },
        output_config: { effort: "low" },
        messages,
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return { busy: true, error: err };
      return { failed: true, error: err };
    }
    if (response.stop_reason === "refusal") return { answer: REFUSED };
    const toolCalls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolCalls.length === 0) {
      let answer = response.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.Beta.BetaTextBlock).text).join("\n").trim();
      if (response.stop_reason === "max_tokens") answer += "\n\n(The answer was cut short. Try a narrower question.)";
      return { answer };
    }
    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const call of toolCalls) {
      const out = await run(call.name, call.input, MODEL_ROWS.anthropic);
      results.push({ type: "tool_result", tool_use_id: call.id, is_error: out.isError, content: out.content });
    }
    messages.push({ role: "user", content: results });
  }
  return { answer: "" };
}

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

    const available = providers();
    if (available.length === 0) return fail(req, 503, "The assistant is not set up yet", "No GROQ_API_KEY, GEMINI_API_KEY or ANTHROPIC_API_KEY secret");

    const { data: allowed, error: limitError } = await caller.userClient.rpc("consume_rate_limit", { p_bucket: "ai_assistant" });
    if (limitError) return fail(req, 500, "Something went wrong", limitError);
    if (!allowed) return fail(req, 429, "You have asked a lot of questions today. Try again tomorrow.");

    // The conversation must be the caller's own (RLS hides everyone else's).
    let conversationId: string;
    const history: Turn[] = [];
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
    const role = ROLE_LABEL[caller.role] ?? "employee";
    const isManager = role === "admin" || role === "company_admin";
    const system = systemPrompt({ name: me?.full_name ?? "a colleague", role, today: new Date().toISOString().slice(0, 10) });
    const tools = toolsFor(role);

    const records: Array<{ tool: string; rows: Record<string, unknown>[] }> = [];
    let recordRows = 0;
    const used: string[] = [];

    // Every tool call from any provider goes through here: checked, role-gated, run as the caller.
    const run: ToolRunner = async (name, input, modelRows) => {
      const checked = validateToolInput(name, input);
      if (!checked.ok) return { content: checked.error, isError: true };
      if (MANAGER_TOOL_NAMES.has(name) && !isManager) return { content: "This tool is only for the Travel Desk and the Director.", isError: true };
      if (used.length < 20) used.push(name);
      try {
        const out = await runTool(name, checked.args, caller);
        const rec = recordsFrom(name, out);
        if (rec && records.length < 8 && recordRows < MAX_RECORD_ROWS) {
          rec.rows = rec.rows.slice(0, MAX_RECORD_ROWS - recordRows);
          recordRows += rec.rows.length;
          records.push(rec);
        }
        return { content: JSON.stringify(forModel(out, modelRows)), isError: false };
      } catch (err) {
        console.error("assistant tool failed", name, err instanceof Error ? err.message : "error");
        return { content: "The records could not be read.", isError: true };
      }
    };

    let answer = "";
    let provider: ProviderId | null = null;
    let lastBusy = false;
    for (const p of available) {
      // A retry with the backup provider starts the lookups again.
      records.length = 0;
      recordRows = 0;
      used.length = 0;
      const result = p.id === "anthropic"
        ? await runAnthropic(p, system, history, question, tools, run)
        : await runOpenAICompat(p, system, history, question, tools, run);
      if ("answer" in result) {
        answer = result.answer;
        provider = p.id;
        break;
      }
      lastBusy = "busy" in result;
      console.error("assistant provider failed", p.id, result.error instanceof Error ? result.error.message : String(result.error).slice(0, 300));
    }
    if (!provider) {
      return lastBusy
        ? fail(req, 503, "The free AI service is busy right now. Try again in a minute.")
        : fail(req, 502, "The assistant could not answer right now");
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

    return json(req, 200, { conversationId, answer, tools: used, records, provider, saved: !saveError });
  } catch (err) {
    return fail(req, 500, "Something went wrong", err);
  }
});
