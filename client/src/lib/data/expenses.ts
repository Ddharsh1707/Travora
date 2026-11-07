import { z } from "zod";
import { getSupabase } from "../supabase";
import { friendlyError } from "./travel";
import { sanitizeTerm } from "./travelQuery";

/**
 * Expense claims, the CEO dashboard and CEO employee management.
 * Every call runs as the signed-in user. The database decides what each
 * person may see or change (employees: only their own; CEO: everything).
 */

export const EXPENSE_CATEGORIES = [
  "airfare", "train", "bus", "cab", "hotel", "meals", "local_transport", "visa", "communication", "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  airfare: "Airfare",
  train: "Train",
  bus: "Bus",
  cab: "Cab / taxi",
  hotel: "Hotel",
  meals: "Meals",
  local_transport: "Local transport",
  visa: "Visa / passport",
  communication: "Phone / internet",
  other: "Other",
};

export const PAYMENT_METHODS = ["personal", "company_card", "cash", "upi", "other"] as const;
export const PAYMENT_LABELS: Record<(typeof PAYMENT_METHODS)[number], string> = {
  personal: "Paid myself (card)",
  company_card: "Company card",
  cash: "Cash",
  upi: "UPI",
  other: "Other",
};

export type ExpenseStatus = "submitted" | "approved" | "rejected" | "reimbursed" | "withdrawn";

export type Expense = {
  id: string;
  employee_id: string;
  travel_record_id: string | null;
  expense_date: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  currency: string;
  payment_method: (typeof PAYMENT_METHODS)[number];
  receipt_document_id: string | null;
  status: ExpenseStatus;
  review_note: string | null;
  reviewed_at: string | null;
  reimbursed_at: string | null;
  created_at: string;
  project_id?: string | null;
  origin?: string | null;
  destination?: string | null;
  source?: "manual" | "upload";
  upload_document_id?: string | null;
  reviewed_by_role?: "admin" | "company_admin" | null;
  employee?: { full_name: string; employee_id: string; department: string | null } | null;
  receipt?: { storage_path: string; original_filename: string } | null;
  upload?: { storage_path: string; original_filename: string } | null;
};

const SELECT =
  "*, employee:profiles!expenses_employee_id_fkey(full_name, employee_id, department), receipt:documents!expenses_receipt_document_id_fkey(storage_path, original_filename), upload:documents!expenses_upload_document_id_fkey(storage_path, original_filename)";

export const expenseInput = z.object({
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date of the expense"),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().trim().min(1, "Say what the expense was for").max(500),
  amount: z.coerce.number({ message: "Enter the amount" }).positive("Amount must be more than zero").max(10_000_000),
  payment_method: z.enum(PAYMENT_METHODS).default("personal"),
  receipt_document_id: z.string().uuid().nullable().optional(),
  travel_record_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  origin: z.string().trim().max(120).nullable().optional().transform((v) => (v ? v : null)),
  destination: z.string().trim().max(120).nullable().optional().transform((v) => (v ? v : null)),
});
export type ExpenseInput = z.input<typeof expenseInput>;

function check(input: ExpenseInput) {
  const parsed = expenseInput.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Some details are not valid.");
  return parsed.data;
}

export async function listExpenses(opts: {
  employeeId?: string;
  status?: ExpenseStatus | "open" | "";
  from?: string;
  to?: string;
  q?: string;
  limit?: number;
} = {}): Promise<Expense[]> {
  let query = getSupabase()
    .from("expenses")
    .select(SELECT)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(opts.limit ?? 300, 1), 1000));
  if (opts.employeeId) query = query.eq("employee_id", opts.employeeId);
  if (opts.status === "open") query = query.in("status", ["submitted", "approved"]);
  else if (opts.status) query = query.eq("status", opts.status);
  if (opts.from) query = query.gte("expense_date", opts.from);
  if (opts.to) query = query.lte("expense_date", opts.to);
  const term = sanitizeTerm(opts.q);
  if (term) query = query.ilike("description", `%${term}%`);
  const { data, error } = await query;
  if (error) throw friendlyError(error, "Could not load expenses.");
  return (data ?? []) as unknown as Expense[];
}

export async function createExpense(employeeId: string, input: ExpenseInput): Promise<void> {
  const data = check(input);
  const { error } = await getSupabase().from("expenses").insert({ ...data, employee_id: employeeId });
  if (error) throw friendlyError(error, "Could not save the expense.");
}

/**
 * Saves many claims from one uploaded sheet in a single insert, so either all
 * are saved or none are. Each claim is linked to the stored sheet.
 */
export async function createExpensesFromUpload(employeeId: string, uploadDocumentId: string, inputs: ExpenseInput[]): Promise<number> {
  if (!inputs.length) return 0;
  if (inputs.length > 500) throw new Error("Upload at most 500 expenses at a time.");
  const rows = inputs.map((i) => ({ ...check(i), employee_id: employeeId, source: "upload", upload_document_id: uploadDocumentId }));
  const { error } = await getSupabase().from("expenses").insert(rows);
  if (error) throw friendlyError(error, "Could not save the expenses.");
  return rows.length;
}

export type ProjectChoice = { id: string; name: string; code: string | null };

/** Active projects anyone can tag a claim with. */
export async function listProjectChoices(): Promise<ProjectChoice[]> {
  const { data, error } = await getSupabase().rpc("project_choices");
  if (error) return []; // older database without the function: claims just have no project
  return (data ?? []) as ProjectChoice[];
}

export async function updateExpense(id: string, input: ExpenseInput): Promise<void> {
  const data = check(input);
  const { error } = await getSupabase().from("expenses").update(data).eq("id", id);
  if (error) throw friendlyError(error, "Could not update the expense.");
}

export async function withdrawExpense(id: string): Promise<void> {
  const { error } = await getSupabase().from("expenses").update({ status: "withdrawn" }).eq("id", id);
  if (error) throw friendlyError(error, "Could not withdraw the expense.");
}

export async function decideExpense(id: string, decision: "approved" | "rejected" | "reimbursed", note?: string): Promise<void> {
  const { error } = await getSupabase().rpc("decide_expense", {
    p_expense: id,
    p_decision: decision,
    p_note: note?.trim().slice(0, 1000) || null,
  });
  if (error) throw friendlyError(error, "Could not record the decision.");
}

/** Totals for a list of claims, by status. */
export function summarizeExpenses(rows: Pick<Expense, "status" | "amount">[]) {
  const sum = (s: ExpenseStatus) => rows.filter((r) => r.status === s).reduce((t, r) => t + Number(r.amount || 0), 0);
  return {
    submitted: sum("submitted"),
    approved: sum("approved"),
    reimbursed: sum("reimbursed"),
    rejected: sum("rejected"),
    submittedCount: rows.filter((r) => r.status === "submitted").length,
  };
}

// ---------------------------------------------------------------------------
// CEO dashboard
// ---------------------------------------------------------------------------

export type CeoDashboard = {
  range: { from: string; to: string };
  people: { total: number; active: number; inactive: number; with_login: number; without_login: number };
  expenses: {
    claims: number; total: number; submitted_count: number; submitted_amount: number;
    approved_amount: number; reimbursed_amount: number; rejected_amount: number;
  };
  travel: { trips: number; spend: number; travellers: number; upcoming: number };
  pending_travel_requests: number;
  by_month: Array<{ month: string; expenses: number; travel: number }>;
  by_category: Array<{ category: ExpenseCategory; claims: number; amount: number }>;
  by_department: Array<{ department: string; expenses: number; travel: number; people: number }>;
  top_spenders: Array<{ employee_id: string; employee_code: string; full_name: string; department: string | null; expenses: number; travel: number; total: number }>;
};

export async function getCeoDashboard(from?: string, to?: string): Promise<CeoDashboard> {
  const { data, error } = await getSupabase().rpc("ceo_dashboard", { p_from: from || null, p_to: to || null });
  if (error) throw friendlyError(error, "Could not load the dashboard. Has the latest SQL migration been run?");
  return data as CeoDashboard;
}

// ---------------------------------------------------------------------------
// CEO: employee management
// ---------------------------------------------------------------------------

export type DbRole = "employee" | "approver" | "travel_desk" | "company_admin" | "admin";
export const DB_ROLE_LABELS: Record<DbRole, string> = {
  employee: "Employee",
  approver: "Manager (approver)",
  travel_desk: "Travel desk",
  company_admin: "Admin",
  admin: "CEO",
};

export type Person = {
  id: string;
  employee_id: string;
  full_name: string;
  email: string | null;
  department: string | null;
  designation: string | null;
  role: DbRole;
  manager_id: string | null;
  manager_name: string | null;
  active: boolean;
  has_login: boolean;
  created_at: string;
  /** Can the signed-in user create a login, reset a password or (de)activate this person? */
  can_manage?: boolean;
};

export async function listPeople(): Promise<Person[]> {
  const { data, error } = await getSupabase().rpc("admin_list_people");
  if (error) throw friendlyError(error, "Could not load employees. Has the latest SQL migration been run?");
  return (data ?? []) as Person[];
}

const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));

export const personInput = z.object({
  employee_id: z.string().trim().regex(/^[A-Za-z0-9._-]{2,32}$/, "Employee ID: 2-32 letters, numbers, dots, dashes or underscores"),
  full_name: z.string().trim().min(1, "Enter the employee's name").max(200),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  department: optional(120),
  designation: optional(120),
  manager_id: z.string().uuid().nullable().optional(),
});
export type PersonInput = z.input<typeof personInput>;

function checkPerson(input: PersonInput) {
  const parsed = personInput.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Some details are not valid.");
  return parsed.data;
}

/** Adds an employee record. Its role starts as employee; change it afterwards with setRole. */
export async function createPerson(input: PersonInput): Promise<string> {
  const data = checkPerson(input);
  const { data: row, error } = await getSupabase().from("profiles").insert({ ...data, role: "employee" }).select("id").single();
  if (error) {
    if (error.code === "23505") throw new Error("That employee ID or email is already used by someone else.");
    throw friendlyError(error, "Could not add the employee.");
  }
  return (row as { id: string }).id;
}

export async function updatePerson(id: string, input: PersonInput): Promise<void> {
  const data = checkPerson(input);
  if (data.manager_id === id) throw new Error("An employee cannot be their own manager.");
  const { error } = await getSupabase().from("profiles").update(data).eq("id", id);
  if (error) {
    if (error.code === "23505") throw new Error("That employee ID or email is already used by someone else.");
    throw friendlyError(error, "Could not update the employee.");
  }
}

export async function setRole(id: string, role: DbRole): Promise<void> {
  const { error } = await getSupabase().rpc("admin_set_role", { p_profile_id: id, p_role: role });
  if (error) throw friendlyError(error, "Could not change the role.");
}

export async function setActive(id: string, active: boolean): Promise<void> {
  const { error } = await getSupabase().rpc("admin_set_active", { p_profile_id: id, p_active: active });
  if (error) throw friendlyError(error, active ? "Could not activate the employee." : "Could not deactivate the employee.");
}

export async function createLogin(id: string, password: string): Promise<void> {
  const { error } = await getSupabase().rpc("admin_create_login", { p_profile_id: id, p_password: password });
  if (error) throw friendlyError(error, "Could not create the login.");
}

export async function resetPassword(id: string, password: string): Promise<void> {
  const { error } = await getSupabase().rpc("admin_reset_password", { p_profile_id: id, p_password: password });
  if (error) throw friendlyError(error, "Could not reset the password.");
}

/** A readable temporary password that meets the sign-in rules (12+ chars, upper, lower, digit). */
export function generateTempPassword(random: (n: number) => number = secureRandom): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits;
  const pick = (set: string) => set[random(set.length)];
  const chars = [pick(upper), pick(lower), pick(digits)];
  while (chars.length < 14) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function secureRandom(n: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % n;
}
