/**
 * fred-turn — one turn of AI speaking practice (feature C).
 *
 * Client uploads audio to `speech/<uid>/<file>` then calls this endpoint. The
 * function verifies the JWT, enforces the daily quota, transcribes, analyses,
 * writes the session and awards points — all server-side. The client never
 * sees the AI key and cannot influence its own score.
 */
import { preflight, json, fail } from "../_shared/http.ts";
import { requireUser, AuthError, BUCKET_SPEECH } from "../_shared/auth.ts";
import { transcribeAudio, analyseSpeech } from "../_shared/ai.ts";

const DAILY_SESSION_LIMIT = Number(Deno.env.get("DAILY_SESSION_LIMIT") ?? "30");
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

  // ---- Input validation -------------------------------------------------
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(req, 400, "invalid_json");
  }

  const audioPath = typeof body.audioPath === "string" ? body.audioPath : "";
  const prompt = typeof body.prompt === "string" ? body.prompt.slice(0, 500) : "";
  const challengeId = typeof body.challengeId === "string" && UUID_RE.test(body.challengeId)
    ? body.challengeId
    : null;

  // The path must live in the caller's own folder. Storage RLS enforces this
  // too, but we check before spending any money on the AI call.
  if (!audioPath || !audioPath.startsWith(`${userId}/`) || audioPath.includes("..")) {
    return fail(req, 403, "invalid_audio_path");
  }

  // ---- Spend guard ------------------------------------------------------
  const { error: quotaError } = await asService.rpc("consume_daily_quota", {
    p_user: userId,
    p_kind: "fred",
    p_limit: DAILY_SESSION_LIMIT,
  });
  if (quotaError) {
    if (quotaError.message?.includes("daily_quota_exceeded")) {
      return fail(req, 429, "daily_limit_reached");
    }
    return fail(req, 500, "quota_check_failed", quotaError);
  }

  try {
    // ---- Learner context (drives level-appropriate coaching) ------------
    const { data: profile } = await asUser
      .from("profiles")
      .select("level, target_language")
      .eq("id", userId)
      .single();

    // ---- Fetch audio and run the AI pipeline ----------------------------
    const { data: audio, error: dlError } = await asService.storage.from(BUCKET_SPEECH).download(audioPath);
    if (dlError || !audio) return fail(req, 404, "audio_not_found", dlError);

    const transcript = await transcribeAudio(audio);
    const analysis = await analyseSpeech({
      transcript,
      prompt,
      level: profile?.level ?? "beginner",
      targetLanguage: profile?.target_language ?? "Spanish",
    });

    // ---- Persist atomically (session + tokens + points + challenge) -----
    const { data: sessionId, error: rpcError } = await asService.rpc("record_fred_session", {
      p_user: userId,
      p_prompt: prompt,
      p_response: transcript,
      p_analysis: analysis.analysis_text,
      p_score: analysis.performance_score,
      p_breakdown: analysis.score_breakdown,
      p_tokens: analysis.tokens_used,
      p_audio_seconds: 0,
      p_challenge_id: challengeId,
    });
    if (rpcError) return fail(req, 500, "persist_failed", rpcError);

    // ---- Raw audio is disposable: delete it once transcribed ------------
    await asService.storage.from(BUCKET_SPEECH).remove([audioPath]);

    return json(req, {
      sessionId,
      transcript,
      analysis: analysis.analysis_text,
      score: analysis.performance_score,
      breakdown: analysis.score_breakdown,
      nextPrompt: analysis.next_prompt,
      starsAwarded: Math.round(analysis.performance_score / 10),
    });
  } catch (err) {
    return fail(req, 502, "ai_pipeline_failed", err);
  }
});
