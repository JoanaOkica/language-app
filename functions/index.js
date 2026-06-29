/**
 * Cloud Functions (2nd gen) — trusted server layer.
 *
 * This is a REFERENCE SKELETON showing the secure pattern, not a finished
 * implementation. The placeholder AI calls (transcribe / chatComplete) are
 * where you wire in your STT + GPT-4o provider.
 *
 * Why this file exists: the client never holds an API key and can never write
 * its own points. Everything that touches a paid API or affects a score lives
 * here and writes via the Admin SDK (which bypasses Firestore rules).
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// Secret is read from Secret Manager at runtime — never in code or client.
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

// --- Per-user daily quota to cap AI spend ---
const DAILY_SESSION_LIMIT = 30;

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Reject anything not authenticated + App Check verified. */
function requireTrustedCaller(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign-in required.");
  }
  if (!request.app) {
    // App Check token missing/invalid -> likely a script, not your app.
    throw new HttpsError("failed-precondition", "App Check required.");
  }
  return request.auth.uid;
}

/** Atomically enforce + increment the user's daily usage. */
async function enforceQuota(uid, usage) {
  const ref = db.doc(`users/${uid}/usage/${todayKey()}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists ? snap.data().sessionCount || 0 : 0;
    if (count >= DAILY_SESSION_LIMIT) {
      throw new HttpsError("resource-exhausted", "Daily practice limit reached.");
    }
    tx.set(ref, {
      sessionCount: admin.firestore.FieldValue.increment(1),
      tokensUsed: admin.firestore.FieldValue.increment(usage.tokens || 0),
      audioSeconds: admin.firestore.FieldValue.increment(usage.audioSeconds || 0),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

/* ============================ FRED ============================ */
/**
 * fredTurn — one turn of AI speaking practice.
 * Client uploads audio to Storage, then calls this with the path.
 */
exports.fredTurn = onCall({ secrets: [OPENAI_API_KEY] }, async (request) => {
  const uid = requireTrustedCaller(request);
  const { sessionId, storagePath, prompt, challengeId } = request.data;
  if (!sessionId || !storagePath) {
    throw new HttpsError("invalid-argument", "sessionId and storagePath required.");
  }

  await enforceQuota(uid, { tokens: 0, audioSeconds: 0 });

  // 1. Download audio from the user's own folder.
  const [audio] = await admin.storage().bucket().file(storagePath).download();

  // 2. Transcribe + analyse (provider call — key from OPENAI_API_KEY.value()).
  const transcript = await transcribe(audio, OPENAI_API_KEY.value());
  const result = await analyseSpeech({
    transcript,
    prompt,
    apiKey: OPENAI_API_KEY.value(),
  }); // -> { analysis_text, performance_score, nextPrompt, tokensUsed }

  // 3. Persist the session (Admin SDK — bypasses rules; client cannot forge).
  await db.doc(`users/${uid}/fred_sessions/${sessionId}`).set({
    userId: uid,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    prompt: prompt || null,
    user_response_text: transcript,
    analysis_text: result.analysis_text,
    performance_score: result.performance_score,
    challengeId: challengeId || null,
    tokensUsed: result.tokensUsed,
  });

  // 4. Award points / advance streak / progress any challenge.
  await awardPoints(uid, scoreToStars(result.performance_score), { source: "fred" });
  if (challengeId) await progressChallenge(challengeId, uid, result.performance_score);

  return {
    transcript,
    analysis: result.analysis_text,
    score: result.performance_score,
    nextPrompt: result.nextPrompt,
  };
});

/* ====================== VOCABULARY (feature A) ====================== */
exports.generateVocabulary = onCall({ secrets: [OPENAI_API_KEY] }, async (request) => {
  const uid = requireTrustedCaller(request);
  const { taskId, title } = request.data;
  if (!taskId || !title) {
    throw new HttpsError("invalid-argument", "taskId and title required.");
  }

  const userSnap = await db.doc(`users/${uid}`).get();
  const level = userSnap.get("fluencyLevel") || "A1";
  const targetLanguage = userSnap.get("targetLanguage") || "es";

  // LLM generates level-appropriate words + sentences for the activity.
  const items = await generateWordList({
    title, level, targetLanguage, apiKey: OPENAI_API_KEY.value(),
  });

  const batch = db.batch();
  const wordIds = [];
  for (const it of items) {
    const ref = db.collection(`users/${uid}/vocabulary`).doc();
    wordIds.push(ref.id);
    batch.set(ref, {
      ...it,
      wordLower: (it.word || "").toLowerCase(),
      taskId,
      taskContext: title,
      fluencyLevel: level,
      mastery: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastReviewedAt: null,
    });
  }
  batch.update(db.doc(`users/${uid}/tasks/${taskId}`), {
    status: "generated",
    generatedWordIds: wordIds,
  });
  await batch.commit();
  return { count: wordIds.length };
});

/* ============== GAMIFICATION + MASCOT (features D & E) ============== */
const OUTFIT_UNLOCKS = { 3: "explorer", 7: "scholar", 14: "globetrotter", 30: "legend" };

/** Server-authoritative points + streak + outfit unlock. */
async function awardPoints(uid, stars, { source }) {
  const ref = db.doc(`users/${uid}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() || {};
    const today = todayKey();
    const last = data.streak?.lastActivityDate;

    let current = data.streak?.current || 0;
    if (last !== today) {
      const wasYesterday = last === isoOffset(-1);
      current = wasYesterday ? current + 1 : 1; // continue or reset
    }
    const longest = Math.max(data.streak?.longest || 0, current);

    // Unlock mascot outfit when a streak threshold is newly reached.
    const unlocked = new Set(data.mascot?.unlockedOutfits || ["default"]);
    if (OUTFIT_UNLOCKS[current]) unlocked.add(OUTFIT_UNLOCKS[current]);

    tx.set(ref, {
      starPoints: admin.firestore.FieldValue.increment(stars),
      streak: { current, longest, lastActivityDate: today },
      mascot: {
        level: Math.min(5, 1 + Math.floor(longest / 7)),
        equippedOutfit: data.mascot?.equippedOutfit || "default",
        unlockedOutfits: Array.from(unlocked),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

/* ================ PUBLIC PROFILE SYNC (feature F) ================ */
/** Mirror only public-safe fields into public_profiles on any user change. */
exports.syncPublicProfile = onDocumentWritten("users/{uid}", async (event) => {
  const after = event.data.after;
  const uid = event.params.uid;
  if (!after.exists) {
    await db.doc(`public_profiles/${uid}`).delete().catch(() => {});
    return;
  }
  const d = after.data();
  if (d.privacy && d.privacy.profilePublic === false) {
    await db.doc(`public_profiles/${uid}`).delete().catch(() => {});
    return;
  }
  await db.doc(`public_profiles/${uid}`).set({
    uid,
    displayName: d.displayName || "",
    photoURL: d.photoURL || null,
    targetLanguage: d.targetLanguage || null,
    streakCurrent: d.streak?.current || 0,
    starPoints: d.starPoints || 0,
    mascotLevel: d.mascot?.level || 1,
    mascotEquippedOutfit: d.mascot?.equippedOutfit || "default",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
});

/* ===================== CHALLENGES (feature G) ===================== */
async function progressChallenge(challengeId, uid, score) {
  const ref = db.doc(`challenges/${challengeId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const c = snap.data();
    if (c.status !== "active" || !c.participants.includes(uid)) return;
    const scores = { ...c.scores, [uid]: (c.scores[uid] || 0) + score };

    const update = { scores, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    // Example terminal condition; adapt to challenge.target.
    if (Date.now() >= c.expiresAt.toMillis()) {
      const [a, b] = c.participants;
      update.status = "completed";
      update.winnerId = (scores[a] || 0) >= (scores[b] || 0) ? a : b;
    }
    tx.set(ref, update, { merge: true });
  });
}

/* ----------------------- helpers / stubs ----------------------- */
function scoreToStars(score) { return Math.round((score || 0) / 10); }
function isoOffset(days) {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// Replace these stubs with real provider calls.
async function transcribe(/* audioBuffer, apiKey */) { return "<transcript>"; }
async function analyseSpeech(/* {transcript, prompt, apiKey} */) {
  return { analysis_text: "<feedback>", performance_score: 0, nextPrompt: "<q>", tokensUsed: 0 };
}
async function generateWordList(/* {title, level, targetLanguage, apiKey} */) { return []; }
