/**
 * Friendly competition (feature G). Scores are written here from verified FRED
 * sessions only — never by clients (the rules block client writes to scores).
 */
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";
import { awardPoints } from "./gamification";

const CHALLENGE_WIN_BONUS = 20;

/**
 * Advance an active challenge with the result of a FRED session, and resolve a
 * winner when the target is met or the challenge has expired.
 */
export async function progressChallenge(
  challengeId: string,
  uid: string,
  score: number
): Promise<void> {
  const ref = db.doc(`challenges/${challengeId}`);
  let winnerId: string | null = null;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const c = snap.data() as any;
    if (c.status !== "active" || !c.participants.includes(uid)) return;

    const scores = { ...c.scores };
    scores[uid] = (scores[uid] ?? 0) + 1; // session count toward target

    const update: Record<string, unknown> = {
      scores,
      updatedAt: FieldValue.serverTimestamp(),
    };

    const target = c.target?.sessions ?? 5;
    const expired = c.expiresAt && Date.now() >= c.expiresAt.toMillis();
    if (scores[uid] >= target || expired) {
      const [a, b] = c.participants as [string, string];
      winnerId = (scores[a] ?? 0) >= (scores[b] ?? 0) ? a : b;
      update.status = "completed";
      update.winnerId = winnerId;
    }
    tx.set(ref, update, { merge: true });
  });

  if (winnerId) await awardPoints(winnerId, CHALLENGE_WIN_BONUS);
}
