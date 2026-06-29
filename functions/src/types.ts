/** Shared data shapes mirroring docs/FIRESTORE_SCHEMA.md. */

export type FluencyLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export interface VocabItem {
  word: string;
  translation: string;
  partOfSpeech?: string;
  exampleSentence: string;
  sentenceTranslation: string;
}

export interface SpeechAnalysis {
  user_response_text: string;
  analysis_text: string;
  performance_score: number; // 0–100
  scoreBreakdown?: { pronunciation: number; grammar: number; fluency: number };
  nextPrompt: string;
  tokensUsed: number;
}
