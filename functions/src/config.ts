/** Secrets, model names, and tunable limits — the cost/security knobs. */
import { defineSecret } from "firebase-functions/params";

/** AI provider key. Stored in Secret Manager, injected at runtime, never shipped. */
export const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

/** Model ids kept here so the provider is swappable in one place. */
export const TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";
export const ANALYSIS_MODEL = "gpt-4o";
export const VOCAB_MODEL = "gpt-4o-mini";

/** Per-user spend guards (enforced server-side in guards.ts). */
export const DAILY_SESSION_LIMIT = 30; // FRED sessions per user per day
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_GAME_POINTS = 50; // cap on a single mini-game award

/** Mascot outfit unlocks keyed by streak length (feature E). */
export const OUTFIT_UNLOCKS: Record<number, string> = {
  3: "explorer",
  7: "scholar",
  14: "globetrotter",
  30: "legend",
};
