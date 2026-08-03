export type Level = "beginner" | "elementary" | "intermediate" | "advanced";
export type TaskStatus = "requested" | "generating" | "generated" | "error";
export type ChallengeStatus = "pending" | "active" | "completed" | "declined" | "expired";

export const LEVELS: Array<{ id: Level; label: string }> = [
  { id: "beginner", label: "Beginner" },
  { id: "elementary", label: "Elementary" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
];

export const levelLabel = (l: Level) =>
  LEVELS.find((x) => x.id === l)?.label ?? "Beginner";

/** Avatar ids are validated by a CHECK constraint in the database. */
export const AVATARS: Array<{ id: string; emoji: string }> = [
  { id: "cat", emoji: "🐱" },
  { id: "fox", emoji: "🦊" },
  { id: "bear", emoji: "🐻" },
  { id: "panda", emoji: "🐼" },
  { id: "koala", emoji: "🐨" },
  { id: "tiger", emoji: "🐯" },
  { id: "frog", emoji: "🐸" },
  { id: "hedgehog", emoji: "🦔" },
  { id: "owl", emoji: "🦉" },
  { id: "unicorn", emoji: "🦄" },
  { id: "penguin", emoji: "🐧" },
  { id: "rabbit", emoji: "🐰" },
];

export const avatarEmoji = (id: string | null | undefined) =>
  AVATARS.find((a) => a.id === id)?.emoji ?? "🐱";

/**
 * The same list feeds both "I speak" and "I'm learning", so any pairing works —
 * Portuguese speaker learning French, Japanese speaker learning Spanish, and so
 * on. The only rule is that the two must differ.
 */
export const LANGUAGES: Array<{ name: string; code: string }> = [
  { name: "English", code: "GB" },
  { name: "Spanish", code: "ES" },
  { name: "Portuguese", code: "PT" },
  { name: "French", code: "FR" },
  { name: "German", code: "DE" },
  { name: "Italian", code: "IT" },
  { name: "Dutch", code: "NL" },
  { name: "Swedish", code: "SE" },
  { name: "Norwegian", code: "NO" },
  { name: "Danish", code: "DK" },
  { name: "Polish", code: "PL" },
  { name: "Czech", code: "CZ" },
  { name: "Romanian", code: "RO" },
  { name: "Greek", code: "GR" },
  { name: "Turkish", code: "TR" },
  { name: "Russian", code: "RU" },
  { name: "Ukrainian", code: "UA" },
  { name: "Arabic", code: "AR" },
  { name: "Hindi", code: "IN" },
  { name: "Mandarin", code: "CN" },
  { name: "Japanese", code: "JP" },
  { name: "Korean", code: "KR" },
];

export const langCode = (name: string) =>
  LANGUAGES.find((l) => l.name === name)?.code ?? "??";

/** BCP-47 tags for speech synthesis (Echo Cat reads the target language aloud). */
const SPEECH_TAGS: Record<string, string> = {
  English: "en-GB", Spanish: "es-ES", Portuguese: "pt-PT", French: "fr-FR",
  German: "de-DE", Italian: "it-IT", Dutch: "nl-NL", Swedish: "sv-SE",
  Norwegian: "nb-NO", Danish: "da-DK", Polish: "pl-PL", Czech: "cs-CZ",
  Romanian: "ro-RO", Greek: "el-GR", Turkish: "tr-TR", Russian: "ru-RU",
  Ukrainian: "uk-UA", Arabic: "ar-SA", Hindi: "hi-IN", Mandarin: "zh-CN",
  Japanese: "ja-JP", Korean: "ko-KR",
};

export const speechTag = (language: string | null | undefined) =>
  SPEECH_TAGS[language ?? ""] ?? "en-GB";

/** XP leagues — presentational, derived from star_points. */
export const LEAGUES = [
  { id: "bronze", name: "Bronze", icon: "🥉", at: 0 },
  { id: "silver", name: "Silver", icon: "🥈", at: 250 },
  { id: "gold", name: "Gold", icon: "🥇", at: 750 },
  { id: "sapphire", name: "Sapphire", icon: "💎", at: 1500 },
  { id: "diamond", name: "Diamond", icon: "👑", at: 3000 },
] as const;

export type League = (typeof LEAGUES)[number];

export function leagueFor(xp: number) {
  let current: League = LEAGUES[0];
  for (const l of LEAGUES) if (xp >= l.at) current = l;
  const next = LEAGUES.find((l) => l.at > xp) ?? null;
  const span = next ? next.at - current.at : 1;
  return {
    current,
    next,
    toNext: next ? next.at - xp : 0,
    progress: next ? Math.min(100, Math.round(((xp - current.at) / span) * 100)) : 100,
  };
}

export const DAILY_GOAL_XP = 40;

export interface Profile {
  id: string;
  username: string | null;
  display_name: string;
  avatar: string;
  native_language: string;
  target_language: string;
  level: Level;
  is_public: boolean;
  onboarded: boolean;
}

export interface UserStats {
  user_id: string;
  star_points: number;
  streak_current: number;
  streak_longest: number;
  last_activity_date: string | null;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  created_at: string;
}

/** One card per word; `examples` holds a sentence per context it was used in. */
export interface WordExample {
  context: string;
  sentence: string;
  translation: string | null;
}

export interface VocabWord {
  id: string;
  word: string;
  translation: string;
  part_of_speech: string | null;
  level: Level;
  created_at: string;
  examples: WordExample[];
}

export interface GenerateResult {
  newWords: number;
  newContexts: number;
  alreadyKnown: number;
}

export interface FredSession {
  id: string;
  prompt: string | null;
  user_response_text: string | null;
  analysis_text: string | null;
  performance_score: number | null;
  created_at: string;
}

export interface PublicProfile {
  id: string;
  username: string | null;
  display_name: string;
  avatar: string;
  star_points: number;
  streak_current: number;
}

export interface FriendRequest extends PublicProfile {
  connection_id: string;
}

export interface Challenge {
  id: string;
  kind: string;
  status: ChallengeStatus;
  target_sessions: number;
  my_score: number;
  their_score: number;
  winner_id: string | null;
  opponent_id: string;
  opponent_name: string;
  opponent_avatar: string;
  i_am_opponent: boolean;
  expires_at: string;
}

export interface LeaderboardRow {
  id: string;
  display_name: string;
  avatar: string;
  star_points: number;
  streak_current: number;
  is_me: boolean;
}

export interface FredTurnResult {
  sessionId: string;
  transcript: string;
  analysis: string;
  score: number;
  breakdown: { pronunciation: number; grammar: number; fluency: number };
  nextPrompt: string;
  starsAwarded: number;
}

export const GAMES = [
  { id: "match", name: "Word Match", desc: "Pair each word with its meaning", icon: "🧩", color: "var(--orange)" },
  { id: "quiz", name: "Quick Quiz", desc: "Pick the right translation, fast", icon: "⚡", color: "var(--teal)" },
  { id: "echo", name: "Echo Cat", desc: "Hear it, then choose what you heard", icon: "🎧", color: "var(--pink)" },
  { id: "builder", name: "Sentence Builder", desc: "Tap the words into the right order", icon: "🏗️", color: "var(--green)" },
] as const;

export type GameId = (typeof GAMES)[number]["id"];
