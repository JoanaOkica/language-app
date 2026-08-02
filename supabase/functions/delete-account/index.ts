/**
 * delete-account — user-initiated erasure (GDPR "right to be forgotten").
 *
 * Deleting the auth user cascades to every table via `on delete cascade`, but
 * storage objects are not covered by foreign keys, so they are removed first.
 * The account acted upon is taken from the verified JWT only.
 */
import { preflight, json, fail } from "../_shared/http.ts";
import { requireUser, AuthError } from "../_shared/auth.ts";

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

  for (const bucket of ["speech", "avatars"]) {
    const { data: files } = await asService.storage.from(bucket).list(userId);
    if (files?.length) {
      await asService.storage.from(bucket).remove(files.map((f) => `${userId}/${f.name}`));
    }
  }

  const { error } = await asService.auth.admin.deleteUser(userId);
  if (error) return fail(req, 500, "delete_failed", error);

  return json(req, { deleted: true });
});
