import type { AuthUser, Role } from "./api";
import { getSupabase } from "./supabase";

/**
 * Supabase sign-in for the existing UI.
 *
 * The role returned here only decides which screens the UI shows. It is not a
 * security control: every read and write is checked again by Row Level
 * Security and the checked database functions.
 */

const ROLE_MAP: Record<string, Role> = {
  employee: "EMPLOYEE",
  approver: "APPROVER",
  travel_desk: "TRAVEL_DESK",
  admin: "ADMIN",
};

type ProfileRow = {
  id: string;
  employee_id: string;
  full_name: string;
  email: string | null;
  department: string | null;
  designation: string | null;
  role: string;
  manager_id: string | null;
};

// AuthUser.id is numeric in the legacy app. Supabase ids are UUIDs, so we keep
// a stable numeric stand-in for legacy screens and expose the real id too.
function numericIdFor(uuid: string): number {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) hash = (hash * 31 + uuid.charCodeAt(i)) | 0;
  return Math.abs(hash) || 1;
}

export type SupabaseAuthUser = AuthUser & { profileId: string; fullName: string; department?: string | null };

export function profileToAuthUser(profile: ProfileRow): SupabaseAuthUser {
  const role = ROLE_MAP[profile.role];
  if (!role) throw new Error("Your account does not have a recognised role. Contact an administrator.");
  return {
    id: numericIdFor(profile.id),
    profileId: profile.id,
    username: profile.email || profile.employee_id,
    fullName: profile.full_name,
    department: profile.department,
    role,
    employeeId: profile.employee_id,
  };
}

async function loadMyProfile(): Promise<SupabaseAuthUser> {
  const { data, error } = await getSupabase().rpc("get_my_profile");
  if (error) throw new Error("Could not load your profile. Please try again.");
  const row = (Array.isArray(data) ? data[0] : data) as ProfileRow | undefined;
  if (!row) {
    // Signed in, but no active employee profile is linked to this login.
    await getSupabase().auth.signOut();
    throw new Error("Your account is not active yet. Ask an administrator to link it to your employee record.");
  }
  return profileToAuthUser(row);
}

export async function supabaseSignIn(email: string, password: string): Promise<SupabaseAuthUser> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
    throw new Error("Please enter your work email address.");
  }
  if (!password) throw new Error("Please enter your password.");

  const { error } = await getSupabase().auth.signInWithPassword({ email: cleanEmail, password });
  if (error) {
    const msg = error.message.toLowerCase();
    // Same message for unknown user and wrong password (no account probing).
    if (msg.includes("invalid login credentials") || (error as { code?: string }).code === "invalid_credentials") {
      throw new Error("Invalid email or password.");
    }
    if (msg.includes("email not confirmed")) {
      throw new Error("This email address has not been confirmed yet. Use the link in the confirmation email, or ask an administrator.");
    }
    if (msg.includes("api key")) {
      throw new Error("The site's Supabase key is wrong (Invalid API key). Check VITE_SUPABASE_ANON_KEY in the hosting settings.");
    }
    // Anything else is a setup or network problem: show Supabase's reason.
    throw new Error(`Could not sign in: ${error.message}`);
  }
  return loadMyProfile();
}

/** Restores the user from an existing Supabase session, or returns null. */
export async function supabaseRestoreSession(): Promise<SupabaseAuthUser | null> {
  const { data } = await getSupabase().auth.getSession();
  if (!data.session) return null;
  try {
    return await loadMyProfile();
  } catch {
    return null;
  }
}

export async function supabaseSignOut(): Promise<void> {
  try {
    await getSupabase().auth.signOut();
  } catch {
    /* already signed out */
  }
}

export function onSupabaseSignedOut(callback: () => void): () => void {
  const { data } = getSupabase().auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") callback();
  });
  return () => data.subscription.unsubscribe();
}

export async function supabaseSendPasswordReset(email: string): Promise<void> {
  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/login` : undefined;
  // Always resolve, so the UI cannot be used to discover which emails exist.
  await getSupabase().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo }).catch(() => undefined);
}

/* ------------------------------------------------------------------------- */
/* Self sign-up                                                               */
/* ------------------------------------------------------------------------- */

/** Mirrors supabase/config.toml: 12+ chars with lower case, upper case and a digit. */
export function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (password.length < 12) problems.push("at least 12 characters");
  if (!/[a-z]/.test(password)) problems.push("a lower-case letter");
  if (!/[A-Z]/.test(password)) problems.push("an upper-case letter");
  if (!/[0-9]/.test(password)) problems.push("a number");
  return problems;
}

/** 0–4, for the strength meter on the sign-up form. */
export function passwordStrength(password: string): number {
  if (!password) return 0;
  const problems = passwordProblems(password).length;
  // Anything that does not meet the rules tops out at "Fair".
  if (problems > 0) return Math.max(0, Math.min(2, 4 - problems - 1));
  return password.length >= 16 || /[^A-Za-z0-9]/.test(password) ? 4 : 3;
}

export type SignUpInput = { fullName: string; email: string; password: string; confirmPassword: string };

export function validateSignUp(input: SignUpInput): string | null {
  const name = input.fullName.trim();
  if (name.length < 2) return "Please enter your full name.";
  if (name.length > 120) return "Name is too long.";
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "Please enter a valid work email address.";
  const problems = passwordProblems(input.password);
  if (problems.length) return `Password needs ${problems.join(", ")}.`;
  if (input.password !== input.confirmPassword) return "Passwords do not match.";
  return null;
}

/**
 * Creates an account. The new person only becomes an 'employee' once they
 * click the link in the confirmation email; the role is decided by the
 * database, never by anything sent from here.
 */
export async function supabaseSignUp(input: SignUpInput): Promise<{ needsConfirmation: boolean; user?: SupabaseAuthUser }> {
  const problem = validateSignUp(input);
  if (problem) throw new Error(problem);
  const email = input.email.trim().toLowerCase();
  const emailRedirectTo = typeof window !== "undefined" ? `${window.location.origin}/login?confirmed=1` : undefined;
  const { data, error } = await getSupabase().auth.signUp({
    email,
    password: input.password,
    options: {
      emailRedirectTo,
      data: { full_name: input.fullName.trim(), signup_source: "self" },
    },
  });
  if (error) {
    const msg = error.message.toLowerCase();
    if ((msg.includes("signup") || msg.includes("sign up")) && (msg.includes("disabled") || msg.includes("not allowed"))) {
      throw new Error("New sign-ups are switched off. Ask an administrator for an invite.");
    }
    if (msg.includes("rate limit") || error.status === 429) {
      throw new Error("Too many attempts right now. Please wait a few minutes and try again.");
    }
    if (msg.includes("email address not authorized")) {
      throw new Error("Sign-up emails can't be sent to this address yet. The site needs its own email sender (Supabase > Authentication > Emails > SMTP Settings).");
    }
    if (msg.includes("sending") && msg.includes("email")) {
      throw new Error("Your account was created, but the confirmation email could not be sent. The site's email settings need attention (Supabase > Authentication > Emails).");
    }
    if (msg.includes("password")) throw new Error(error.message);
    // Show Supabase's own reason so setup problems are easy to spot.
    throw new Error(`Could not create your account: ${error.message}`);
  }
  // Email confirmation switched off in Supabase: the user is signed in already.
  if (data.session) return { needsConfirmation: false, user: await loadMyProfile() };
  // Supabase returns the same answer whether or not the email was already
  // registered, so this cannot be used to find out who has an account.
  return { needsConfirmation: true };
}

export async function supabaseResendConfirmation(email: string): Promise<void> {
  const emailRedirectTo = typeof window !== "undefined" ? `${window.location.origin}/login?confirmed=1` : undefined;
  await getSupabase()
    .auth.resend({ type: "signup", email: email.trim().toLowerCase(), options: { emailRedirectTo } })
    .catch(() => undefined);
}
