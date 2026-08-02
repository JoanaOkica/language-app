/**
 * generate-vocabulary — task-based word/sentence generation (feature A).
 *
 * The task row must already exist and belong to the caller; ownership is proven
 * by reading it through the *user-scoped* client, so RLS does the authorisation
 * rather than a hand-written check that could drift.
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

  // RLS guarantees this returns a row only if the task belongs to the caller.
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

  await asUser.from("tasks").update({ status: "generating" }).eq("id", taskId);

  try {
    const { items, tokens } = await generateVocabulary({
      title: task.title,
      level: profile?.level ?? "A1",
      targetLanguage: profile?.target_language ?? "Spanish",
      nativeLanguage: profile?.native_language ?? "English",
    });

    if (items.length === 0) {
      await asUser.from("tasks").update({ status: "error" }).eq("id", taskId);
      return fail(req, 422, "no_vocabulary_generated");
    }

    // Written through the user client: RLS re-verifies every row's user_id.
    const { error: insertError } = await asUser.from("vocabulary").insert(
      items.map((it) => ({
        user_id: userId,
        task_id: taskId,
        word: it.word,
        translation: it.translation,
        part_of_speech: it.part_of_speech,
        example_sentence: it.example_sentence,
        sentence_translation: it.sentence_translation,
        task_context: task.title,
        level: profile?.level ?? "A1",
      })),
    );
    if (insertError) {
      await asUser.from("tasks").update({ status: "error" }).eq("id", taskId);
      return fail(req, 500, "save_failed", insertError);
    }

    await asUser.from("tasks").update({ status: "generated" }).eq("id", taskId);
    // Increment, never overwrite: the day's running total also covers FRED.
    await asService.rpc("add_token_usage", { p_user: userId, p_tokens: tokens });

    return json(req, { count: items.length, items });
  } catch (err) {
    await asUser.from("tasks").update({ status: "error" }).eq("id", taskId);
    return fail(req, 502, "generation_failed", err);
  }
});
