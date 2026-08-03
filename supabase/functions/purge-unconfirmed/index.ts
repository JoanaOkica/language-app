/**
 * purge-unconfirmed — deletes Linguafox signups that were never confirmed.
 *
 * Use this when pg_cron is not enabled on the project: point any external
 * scheduler (GitHub Actions, cron-job.org, Supabase scheduled function) at it
 * hourly. It is a thin wrapper around `linguafox.purge_unconfirmed_signups()`,
 * which does the scoping — only rows tagged `app: 'linguafox'` are eligible,
 * so other projects sharing `auth.users` are never affected.
 *
 * This endpoint takes no user JWT, so it is protected by a shared secret
 * instead: the caller must present `x-purge-secret` matching PURGE_SECRET.
 * Deploy it with --no-verify-jwt.
 */
import { preflight, json, fail } from "../_shared/http.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SCHEMA } from "../_shared/auth.ts";

const GRACE_HOURS = Number(Deno.env.get("UNCONFIRMED_GRACE_HOURS") ?? "24");

/** Length-independent comparison, so timing cannot leak the secret. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed");

  const expected = Deno.env.get("PURGE_SECRET") ?? "";
  const provided = req.headers.get("x-purge-secret") ?? "";
  if (!expected || !safeEqual(provided, expected)) {
    return fail(req, 401, "unauthorized");
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: SCHEMA }, auth: { persistSession: false } },
  );

  const { data, error } = await admin.rpc("purge_unconfirmed_signups", {
    p_grace: `${GRACE_HOURS} hours`,
  });
  if (error) return fail(req, 500, "purge_failed", error);

  return json(req, { deleted: data ?? 0, graceHours: GRACE_HOURS });
});
