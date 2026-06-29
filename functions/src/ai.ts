/**
 * AI provider integration — the ONLY module that talks to the paid API.
 * Isolated so the provider (here: OpenAI GPT-4o) can be swapped in one place.
 * The API key is passed in from Secret Manager; it never leaves the server.
 */
import { TRANSCRIBE_MODEL, ANALYSIS_MODEL, VOCAB_MODEL } from "./config";
import { FluencyLevel, SpeechAnalysis, VocabItem } from "./types";

const OPENAI_BASE = "https://api.openai.com/v1";

/** Speech-to-text for a FRED audio turn. */
export async function transcribeAudio(audio: Buffer, apiKey: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)]), "audio.webm");
  form.append("model", TRANSCRIBE_MODEL);
  const res = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Transcription failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { text: string };
  return data.text ?? "";
}

/**
 * Analyse the learner's spoken response and produce coach feedback + score.
 * The system prompt is fixed server-side so a client cannot inject prompts.
 */
export async function analyseSpeech(params: {
  transcript: string;
  prompt: string;
  level: FluencyLevel;
  targetLanguage: string;
  apiKey: string;
}): Promise<SpeechAnalysis> {
  const system =
    `You are FRED, a friendly ${params.targetLanguage} speaking coach for a CEFR ${params.level} learner. ` +
    `Given the question you asked and the learner's transcribed reply, return STRICT JSON with keys: ` +
    `analysis_text (concise feedback on grammar and likely pronunciation issues, encouraging tone), ` +
    `performance_score (integer 0-100), scoreBreakdown {pronunciation,grammar,fluency} each 0-100, ` +
    `nextPrompt (your next question in ${params.targetLanguage}, level-appropriate).`;
  const user = `You asked: "${params.prompt}". Learner replied: "${params.transcript}".`;

  const { json, tokens } = await chatJson(ANALYSIS_MODEL, system, user, params.apiKey);
  return {
    user_response_text: params.transcript,
    analysis_text: String(json.analysis_text ?? ""),
    performance_score: clampScore(json.performance_score),
    scoreBreakdown: json.scoreBreakdown,
    nextPrompt: String(json.nextPrompt ?? ""),
    tokensUsed: tokens,
  };
}

/** Generate a level-appropriate word + sentence list for a task (feature A). */
export async function generateWordList(params: {
  title: string;
  level: FluencyLevel;
  targetLanguage: string;
  nativeLanguage: string;
  apiKey: string;
}): Promise<{ items: VocabItem[]; tokens: number }> {
  const system =
    `You generate vocabulary for a CEFR ${params.level} learner of ${params.targetLanguage} ` +
    `whose native language is ${params.nativeLanguage}. Return STRICT JSON: ` +
    `{ "items": [ { "word", "translation", "partOfSpeech", "exampleSentence", "sentenceTranslation" } ] }. ` +
    `Produce 6-10 useful items for the given activity. Words/sentences in ${params.targetLanguage}; ` +
    `translations in ${params.nativeLanguage}.`;
  const user = `Activity: "${params.title}".`;

  const { json, tokens } = await chatJson(VOCAB_MODEL, system, user, params.apiKey);
  const items: VocabItem[] = Array.isArray(json.items) ? json.items.slice(0, 12) : [];
  return { items, tokens };
}

/* ----------------------- internal helpers ----------------------- */

async function chatJson(
  model: string,
  system: string,
  user: string,
  apiKey: string
): Promise<{ json: any; tokens: number }> {
  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI request failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as any;
  const content = data.choices?.[0]?.message?.content ?? "{}";
  return { json: JSON.parse(content), tokens: data.usage?.total_tokens ?? 0 };
}

function clampScore(v: unknown): number {
  const n = Math.round(Number(v) || 0);
  return Math.max(0, Math.min(100, n));
}
