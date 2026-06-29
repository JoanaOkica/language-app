/**
 * Social/profile server logic (feature F):
 *  - syncPublicProfile: mirror only public-safe fields into public_profiles.
 *  - awardGamePoints: callable for mini-game Star Points (capped, server-checked).
 *  - deleteMyAccount: purge a user's data on account deletion.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";
import { MAX_GAME_POINTS } from "./config";
import { requireTrustedCaller } from "./guards";
import { awardPoints } from "./gamification";

/** Keep public_profiles/{uid} in sync with the public-safe fields of the user. */
export const syncPublicProfile = onDocumentWritten("users/{uid}", async (event) => {
  const uid = event.params.uid;
  const after = event.data?.after;
  const pubRef = db.doc(`public_profiles/${uid}`);

  if (!after?.exists) {
    await pubRef.delete().catch(() => undefined);
    return;
  }
  const d = after.data() as any;
  if (d.privacy?.profilePublic === false) {
    await pubRef.delete().catch(() => undefined);
    return;
  }
  await pubRef.set({
    uid,
    displayName: d.displayName ?? "",
    photoURL: d.photoURL ?? null,
    targetLanguage: d.targetLanguage ?? null,
    streakCurrent: d.streak?.current ?? 0,
    starPoints: d.starPoints ?? 0,
    mascotLevel: d.mascot?.level ?? 1,
    mascotEquippedOutfit: d.mascot?.equippedOutfit ?? "default",
    updatedAt: FieldValue.serverTimestamp(),
  });
});

/** Mini-game Star Points (feature D), routed through the authoritative engine. */
export const awardGamePoints = onCall(async (request) => {
  const uid = requireTrustedCaller(request);
  const points = Number(request.data?.points);
  if (!Number.isFinite(points) || points <= 0 || points > MAX_GAME_POINTS) {
    throw new HttpsError("invalid-argument", `points must be 1–${MAX_GAME_POINTS}.`);
  }
  await awardPoints(uid, Math.round(points));
  return { ok: true };
});

/** Account deletion: purge subcollections, social edges, then the auth user. */
export const deleteMyAccount = onCall(async (request) => {
  const uid = requireTrustedCaller(request);

  for (const sub of ["vocabulary", "tasks", "fred_sessions", "usage"]) {
    await db.recursiveDelete(db.collection(`users/${uid}/${sub}`));
  }
  await db.doc(`public_profiles/${uid}`).delete().catch(() => undefined);

  const conns = await db.collection("connections").where("users", "array-contains", uid).get();
  await Promise.all(conns.docs.map((doc) => doc.ref.delete()));

  await db.doc(`users/${uid}`).delete().catch(() => undefined);
  await getAuth().deleteUser(uid).catch(() => undefined);
  return { ok: true };
});
