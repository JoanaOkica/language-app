/** Auth + App Check + quota guards. Every paid-AI callable starts here. */
import { CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";
import { DAILY_SESSION_LIMIT } from "./config";

/** Reject anything that is not an authenticated, App Check–attested call. */
export function requireTrustedCaller(req: CallableRequest): string {
  if (!req.auth) {
    throw new HttpsError("unauthenticated", "Sign-in required.");
  }
  if (!req.app) {
    // App Check token missing/invalid -> almost certainly a script, not the app.
    throw new HttpsError("failed-precondition", "App Check verification required.");
  }
  return req.auth.uid;
}

/** UTC date key, e.g. "2026-06-29", for daily usage buckets. */
export function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Atomically check the daily session cap and record usage for cost tracking.
 * Throws resource-exhausted once the user hits the limit.
 */
export async function consumeDailySession(
  uid: string,
  usage: { tokens?: number; audioSeconds?: number } = {}
): Promise<void> {
  const ref = db.doc(`users/${uid}/usage/${todayKey()}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists ? (snap.data()?.sessionCount ?? 0) : 0;
    if (count >= DAILY_SESSION_LIMIT) {
      throw new HttpsError("resource-exhausted", "Daily practice limit reached.");
    }
    tx.set(
      ref,
      {
        sessionCount: FieldValue.increment(1),
        tokensUsed: FieldValue.increment(usage.tokens ?? 0),
        audioSeconds: FieldValue.increment(usage.audioSeconds ?? 0),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

/** Record extra token usage after the AI call resolves (for accurate cost stats). */
export async function recordTokenUsage(uid: string, tokens: number): Promise<void> {
  if (!tokens) return;
  await db.doc(`users/${uid}/usage/${todayKey()}`).set(
    { tokensUsed: FieldValue.increment(tokens), updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}
