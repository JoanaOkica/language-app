/**
 * fredTurn — one turn of AI speaking practice (feature C).
 * Client uploads audio to Storage, then calls this with the path. The function
 * verifies the caller, enforces quota, transcribes + analyses, persists the
 * session, and awards points — all server-side.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db, storage } from "./admin";
import { OPENAI_API_KEY } from "./config";
import { requireTrustedCaller, consumeDailySession, recordTokenUsage } from "./guards";
import { transcribeAudio, analyseSpeech } from "./ai";
import { awardPoints, scoreToStars } from "./gamification";
import { progressChallenge } from "./challenges";
import { FluencyLevel } from "./types";

export const fredTurn = onCall({ secrets: [OPENAI_API_KEY] }, async (request) => {
  const uid = requireTrustedCaller(request);
  const { sessionId, storagePath, prompt, challengeId } = request.data ?? {};
  if (typeof sessionId !== "string" || typeof storagePath !== "string") {
    throw new HttpsError("invalid-argument", "sessionId and storagePath are required.");
  }
  // The audio must live in the caller's own folder.
  if (!storagePath.startsWith(`audio/${uid}/`)) {
    throw new HttpsError("permission-denied", "Audio path does not belong to caller.");
  }

  // 1. Reserve a daily session slot (throws if over quota).
  await consumeDailySession(uid);

  // 2. Read user context for level-appropriate coaching.
  const userSnap = await db.doc(`users/${uid}`).get();
  const level = (userSnap.get("fluencyLevel") as FluencyLevel) ?? "A1";
  const targetLanguage = (userSnap.get("targetLanguage") as string) ?? "Spanish";

  // 3. Download audio (Admin SDK) and run the AI pipeline.
  const [audio] = await storage.bucket().file(storagePath).download();
  const transcript = await transcribeAudio(audio, OPENAI_API_KEY.value());
  const result = await analyseSpeech({
    transcript,
    prompt: typeof prompt === "string" ? prompt : "",
    level,
    targetLanguage,
    apiKey: OPENAI_API_KEY.value(),
  });

  // 4. Persist the session (Admin SDK bypasses rules; clients are read-only here).
  await db.doc(`users/${uid}/fred_sessions/${sessionId}`).set({
    userId: uid,
    timestamp: FieldValue.serverTimestamp(),
    prompt: prompt ?? null,
    user_response_text: result.user_response_text,
    analysis_text: result.analysis_text,
    performance_score: result.performance_score,
    scoreBreakdown: result.scoreBreakdown ?? null,
    challengeId: typeof challengeId === "string" ? challengeId : null,
    tokensUsed: result.tokensUsed,
  });

  // 5. Record cost, award points/streak, progress any challenge.
  await recordTokenUsage(uid, result.tokensUsed);
  await awardPoints(uid, scoreToStars(result.performance_score));
  if (typeof challengeId === "string" && challengeId) {
    await progressChallenge(challengeId, uid, result.performance_score);
  }

  // 6. Best-effort cleanup of the raw audio (privacy + cost).
  await storage.bucket().file(storagePath).delete().catch(() => undefined);

  return {
    transcript: result.user_response_text,
    analysis: result.analysis_text,
    score: result.performance_score,
    nextPrompt: result.nextPrompt,
  };
});
