/**
 * delete-account — user-initiated erasure (GDPR "right to be forgotten").
 *
 * Deleting the auth user cascades to every Linguafox table via `on delete
 * cascade`; storage objects are not covered by foreign keys, so they go first.
 * The account acted upon comes from the verified JWT only.
 *
 * Re-authentication is mandatory. Account deletion is irreversible, so a stolen
 * or borrowed session must not be enough on its own — the caller has to prove
 * they know the current password.
 */
import { preflight, json, fail } from "../_shared/http.ts";
import { requireUser, AuthError, BUCKET_SPEECH, BUCKET_AVATARS } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed");

  let caller;
  try {
    caller = await requireUser(req);
  } catch (e) {
    return fail(req, 401, e instanceof AuthError ? e.message : "unauthorized");
  }
  const { userId, asService } = caller;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(req, 400, "invalid_json");
  }
  const password = typeof body.password === "string" ? body.password : "";
  if (!password) return fail(req, 400, "password_required");

  // ---- Step-up authentication -------------------------------------------
  const { data: userRow, error: lookupError } = await asService.auth.admin.getUserById(userId);
  if (lookupError || !userRow?.user?.email) return fail(req, 500, "lookup_failed", lookupError);

  // A throwaway client so verifying the password cannot disturb the caller's
  // own session.
  const verifier = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error: pwError } = await verifier.auth.signInWithPassword({
    email: userRow.user.email,
    password,
  });
  if (pwError) return fail(req, 403, "password_incorrect");

  // ---- Erase ------------------------------------------------------------
  for (const bucket of [BUCKET_SPEECH, BUCKET_AVATARS]) {
    const { data: files } = await asService.storage.from(bucket).list(userId);
    if (files?.length) {
      await asService.storage.from(bucket).remove(files.map((f) => `${userId}/${f.name}`));
    }
  }

  const { error } = await asService.auth.admin.deleteUser(userId);
  if (error) return fail(req, 500, "delete_failed", error);

  return json(req, { deleted: true });
});
