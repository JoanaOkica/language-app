/**
 * generate-vocabulary — task-based word generation (feature A).
 *
 * Repeated routines are handled here: the model is told which words the learner
 * already has, and `upsert_vocabulary` guarantees one card per word. A word the
 * learner already knows gains a *new example sentence* for the new context
 * instead of becoming a duplicate card; a genuinely repeated context is a no-op.
 */
import { preflight, json, fail } from "../_shared/http.ts";
import { requireUser, AuthError } from "../_shared/auth.ts";
import { generateVocabulary } from "../_shared/ai.ts";

const DAILY_GENERATION_LIMIT = Number(Deno.env.get("DAILY_GENERATION_LIMIT") ?? "40");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const { userId, asUser, asService } = caller;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(req, 400, "invalid_json");
  }

  const taskId = typeof body.taskId === "string" && UUID_RE.test(body.taskId) ? body.taskId : null;
  if (!taskId) return fail(req, 400, "invalid_task_id");

  // RLS guarantees a row comes back only if the task belongs to the caller.
  const { data: task, error: taskError } = await asUser
    .from("tasks")
    .select("id, title, status")
    .eq("id", taskId)
    .single();
  if (taskError || !task) return fail(req, 404, "task_not_found");
  if (task.status === "generated") return fail(req, 409, "already_generated");

  const { error: quotaError } = await asService.rpc("consume_daily_quota", {
    p_user: userId,
    p_limit: DAILY_GENERATION_LIMIT,
  });
  if (quotaError) {
    if (quotaError.message?.includes("daily_quota_exceeded")) {
      return fail(req, 429, "daily_limit_reached");
    }
    return fail(req, 500, "quota_check_failed", quotaError);
  }

  const { data: profile } = await asUser
    .from("profiles")
    .select("level, target_language, native_language")
    .eq("id", userId)
    .single();
  const level = profile?.level ?? "beginner";

  // Words already on the learner's shelf. Sent to the model so it can write a
  // sentence that fits *this* context rather than repeating an old one.
  const { data: known } = await asService.rpc("known_words", { p_user: userId });

  await asUser.from("tasks").update({ status: "generating" }).eq("id", taskId);

  try {
    const { items, tokens } = await generateVocabulary({
      title: task.title,
      level,
      targetLanguage: profile?.target_language ?? "Spanish",
      nativeLanguage: profile?.native_language ?? "English",
      knownWords: Array.isArray(known) ? known : [],
    });

    if (items.length === 0) {
      await asUser.from("tasks").update({ status: "error" }).eq("id", taskId);
      return fail(req, 422, "no_vocabulary_generated");
    }

    // One transaction decides new card / new context / already known.
    const { data: result, error: upsertError } = await asService.rpc("upsert_vocabulary", {
      p_user: userId,
      p_task: taskId,
      p_context: task.title,
      p_level: level,
      p_items: items,
    });
    if (upsertError) {
      await asUser.from("tasks").update({ status: "error" }).eq("id", taskId);
      return fail(req, 500, "save_failed", upsertError);
    }

    await asUser.from("tasks").update({ status: "generated" }).eq("id", taskId);
    await asService.rpc("add_token_usage", { p_user: userId, p_tokens: tokens });

    const counts = Array.isArray(result) ? result[0] : result;
    return json(req, {
      newWords: counts?.new_words ?? 0,
      newContexts: counts?.new_contexts ?? 0,
      alreadyKnown: counts?.already_known ?? 0,
    });
  } catch (err) {
    await asUser.from("tasks").update({ status: "error" }).eq("id", taskId);
    return fail(req, 502, "generation_failed", err);
  }
});
