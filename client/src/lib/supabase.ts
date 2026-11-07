export type SupabaseClient = any;

const createClient = (url: string, key: string, options?: any): SupabaseClient => {
  return {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => ({ select: () => ({ data: [], error: null }) }),
  };
};

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

const SUPABASE_URL = env.VITE_SUPABASE_URL?.trim() || "";
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY?.trim() || "";

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

/** The Supabase address this build was made with, for error messages (never secret). */
export const supabaseUrlForDisplay = SUPABASE_URL || "(not set)";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isSupabaseEnabled) {
    throw new Error("Supabase is not enabled. Set VITE_AUTH_PROVIDER=supabase.");
  }
  if (client) return client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
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

export const __test__ = { looksLikeServiceRoleKey };
