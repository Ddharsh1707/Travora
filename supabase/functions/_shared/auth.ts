// Who is calling? Verifies the user's JWT with Supabase Auth and loads their
// role from the database. Never trusts a role sent by the browser.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

export type AppRole = "employee" | "approver" | "travel_desk" | "company_admin" | "admin";

export type Caller = {
  userId: string;
  profileId: string;
  role: AppRole;
  /** Client that acts AS the user: every query goes through RLS. */
  userClient: SupabaseClient;
};

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export async function getCaller(req: Request): Promise<Caller | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;

  const userClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return null;

  const { data, error } = await userClient.rpc("get_my_profile");
  const profile = Array.isArray(data) ? data[0] : data;
  if (error || !profile) return null;

  return { userId: userData.user.id, profileId: profile.id, role: profile.role, userClient };
}

/**
 * Service-role client. Bypasses RLS, so use it ONLY for the specific
 * privileged step after the caller has been authorized in code.
 * The key is injected by Supabase into the function runtime; it is never sent
 * to the browser.
 */
export function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
