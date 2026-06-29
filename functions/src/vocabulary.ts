/**
 * generateVocabulary — task-based word/sentence generation (feature A).
 * The client creates a task doc (status: "requested"), then calls this. The
 * function generates level-appropriate items, writes them to the user's
 * vocabulary subcollection, and marks the task generated.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";
import { OPENAI_API_KEY } from "./config";
import { requireTrustedCaller, recordTokenUsage } from "./guards";
import { generateWordList } from "./ai";
import { FluencyLevel } from "./types";

export const generateVocabulary = onCall({ secrets: [OPENAI_API_KEY] }, async (request) => {
  const uid = requireTrustedCaller(request);
  const { taskId, title } = request.data ?? {};
  if (typeof taskId !== "string" || typeof title !== "string" || !title.trim()) {
    throw new HttpsError("invalid-argument", "taskId and a non-empty title are required.");
  }

  const userSnap = await db.doc(`users/${uid}`).get();
  const level = (userSnap.get("fluencyLevel") as FluencyLevel) ?? "A1";
  const targetLanguage = (userSnap.get("targetLanguage") as string) ?? "Spanish";
  const nativeLanguage = (userSnap.get("nativeLanguage") as string) ?? "English";

  const taskRef = db.doc(`users/${uid}/tasks/${taskId}`);
  await taskRef.set({ status: "generating" }, { merge: true });

  try {
    const { items, tokens } = await generateWordList({
      title,
      level,
      targetLanguage,
      nativeLanguage,
      apiKey: OPENAI_API_KEY.value(),
    });

    const batch = db.batch();
    const wordIds: string[] = [];
    for (const it of items) {
      const ref = db.collection(`users/${uid}/vocabulary`).doc();
      wordIds.push(ref.id);
      batch.set(ref, {
        word: it.word,
        wordLower: (it.word ?? "").toLowerCase(),
        translation: it.translation,
        partOfSpeech: it.partOfSpeech ?? null,
        exampleSentence: it.exampleSentence,
        sentenceTranslation: it.sentenceTranslation,
        taskId,
        taskContext: title,
        fluencyLevel: level,
        mastery: 0,
        createdAt: FieldValue.serverTimestamp(),
        lastReviewedAt: null,
      });
    }
    batch.set(
      taskRef,
      { status: "generated", generatedWordIds: wordIds, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    await batch.commit();
    await recordTokenUsage(uid, tokens);

    return { count: wordIds.length, wordIds };
  } catch (err) {
    await taskRef.set({ status: "error" }, { merge: true });
    throw new HttpsError("internal", "Vocabulary generation failed.");
  }
});
