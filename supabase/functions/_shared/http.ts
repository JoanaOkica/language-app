/**
 * HTTP helpers: locked-down CORS and uniform JSON responses.
 *
 * CORS is an allow-list, never `*`. Edge Functions are called with the user's
 * JWT, so a wildcard origin would let any website on the internet invoke them
 * from a logged-in victim's browser.
 */

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function preflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response("ok", { headers: corsHeaders(req.headers.get("origin")) });
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req.headers.get("origin")), "Content-Type": "application/json" },
  });
}

/**
 * Error responses are deliberately terse. Internal messages (SQL errors,
 * upstream API payloads) are logged server-side but never returned to the
 * client, since they leak schema and infrastructure details.
 */
export function fail(req: Request, status: number, code: string, detail?: unknown): Response {
  if (detail) console.error(`[${code}]`, detail);
  return json(req, { error: code }, status);
}
