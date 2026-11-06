import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client.
 *
 * Only two values are read here, and both are designed to be public:
 *   VITE_SUPABASE_URL       – the project URL
 *   VITE_SUPABASE_ANON_KEY  – the anon / publishable key (RLS limits what it can do)
 *
 * The service-role key, database password and AI keys must NEVER be given a
 * VITE_ prefix: Vite copies every VITE_ variable into the public bundle.
 *
 * The session is kept in sessionStorage (cleared when the tab closes) rather
 * than localStorage, to shorten how long a token stays on a shared machine.
 */

export type AuthProvider = "legacy" | "supabase";

const env = ((typeof import.meta !== "undefined" && import.meta.env) || {}) as Record<string, string | undefined>;

export const AUTH_PROVIDER: AuthProvider = env.VITE_AUTH_PROVIDER === "supabase" ? "supabase" : "legacy";

/** Strips spaces and wrapping quotes that hosting dashboards sometimes keep. */
function cleanValue(value: string | undefined): string {
  return (value ?? "").trim().replace(/^["']+|["']+$/g, "").trim();
}

/**
 * Accepts the common ways a project URL gets pasted ("abcd.supabase.co",
 * "https://abcd.supabase.co/", ".../rest/v1") and returns "https://abcd.supabase.co".
 */
export function normalizeSupabaseUrl(value: string | undefined): string {
  let url = cleanValue(value);
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  url = url.replace(/\/(rest|auth)\/v1\/?$/i, "").replace(/\/+$/, "");
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

const RAW_SUPABASE_URL = cleanValue(env.VITE_SUPABASE_URL);
const SUPABASE_URL = normalizeSupabaseUrl(RAW_SUPABASE_URL);
const SUPABASE_ANON_KEY = cleanValue(env.VITE_SUPABASE_ANON_KEY);

function looksLikeServiceRoleKey(key: string): boolean {
  // New-style secret keys, or legacy JWTs whose payload says role=service_role.
  if (key.startsWith("sb_secret_")) return true;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

export const isSupabaseEnabled = AUTH_PROVIDER === "supabase";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isSupabaseEnabled) {
    throw new Error("Supabase is not enabled. Set VITE_AUTH_PROVIDER=supabase.");
  }
  if (client) return client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    const problem = RAW_SUPABASE_URL && !SUPABASE_URL
      ? "VITE_SUPABASE_URL is not a valid URL. Use the Project URL from Supabase, like https://abcd1234.supabase.co."
      : "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.";
    throw new Error(`Supabase is not configured. ${problem} Then rebuild the site.`);
  }
  if (looksLikeServiceRoleKey(SUPABASE_ANON_KEY)) {
    // Refuse to run rather than ship an all-powerful key to every visitor.
    throw new Error("Refusing to start: a service-role/secret key was supplied to the browser. Use the anon/publishable key.");
  }
  const storage = typeof window !== "undefined" ? window.sessionStorage : undefined;
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage,
      storageKey: "trapple-auth",
    },
  });
  return client;
}

export const __test__ = { looksLikeServiceRoleKey, normalizeSupabaseUrl };
