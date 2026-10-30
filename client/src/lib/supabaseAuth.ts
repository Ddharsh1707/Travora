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
    // Same message for unknown user and wrong password (no account probing).
    throw new Error("Invalid email or password.");
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
