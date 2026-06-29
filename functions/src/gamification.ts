/**
 * Server-authoritative gamification: Star Points, streaks, and mascot outfit
 * unlocks (features D & E). This is the ONLY place these fields are written, so
 * points/streaks cannot be forged from the client.
 */
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";
import { todayKey } from "./guards";
import { OUTFIT_UNLOCKS } from "./config";

function isoOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Award Star Points and advance the daily streak in one transaction.
 * Continues the streak if the last activity was yesterday, resets to 1 if the
 * gap is larger, and is idempotent within the same day for the streak count.
 */
export async function awardPoints(uid: string, stars: number): Promise<void> {
  const ref = db.doc(`users/${uid}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() ?? {};
    const today = todayKey();
    const last: string | undefined = data.streak?.lastActivityDate;

    let current = data.streak?.current ?? 0;
    if (last !== today) {
      current = last === isoOffset(-1) ? current + 1 : 1;
    }
    const longest = Math.max(data.streak?.longest ?? 0, current);

    const unlocked = new Set<string>(data.mascot?.unlockedOutfits ?? ["default"]);
    if (OUTFIT_UNLOCKS[current]) unlocked.add(OUTFIT_UNLOCKS[current]);

    tx.set(
      ref,
      {
        starPoints: FieldValue.increment(stars),
        streak: { current, longest, lastActivityDate: today },
        mascot: {
          level: Math.min(5, 1 + Math.floor(longest / 7)),
          equippedOutfit: data.mascot?.equippedOutfit ?? "default",
          unlockedOutfits: Array.from(unlocked),
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

/** A FRED performance score (0–100) converts to Star Points. */
export function scoreToStars(score: number): number {
  return Math.round(score / 10);
}
