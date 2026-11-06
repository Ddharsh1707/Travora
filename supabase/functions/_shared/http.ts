// Shared helpers for Edge Functions: CORS, JSON responses, safe errors.

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  // Only echo back origins we know. Never "*", because requests carry user tokens.
  if (allowedOrigins.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** Generic message to the user; details only go to the function logs. */
export function fail(req: Request, status: number, publicMessage: string, internal?: unknown): Response {
  if (internal) console.error(publicMessage, internal instanceof Error ? internal.message : internal);
  return json(req, status, { error: publicMessage });
}
