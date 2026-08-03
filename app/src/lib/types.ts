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
];

export const avatarEmoji = (id: string | null | undefined) =>
  AVATARS.find((a) => a.id === id)?.emoji ?? "🦊";

export const LANGUAGES: Array<{ name: string; code: string }> = [
  { name: "Spanish", code: "ES" },
  { name: "French", code: "FR" },
  { name: "German", code: "DE" },
  { name: "Italian", code: "IT" },
  { name: "Portuguese", code: "PT" },
  { name: "Japanese", code: "JP" },
  { name: "Korean", code: "KR" },
  { name: "Dutch", code: "NL" },
  { name: "Swedish", code: "SE" },
  { name: "English", code: "GB" },
];

export const langCode = (name: string) =>
  LANGUAGES.find((l) => l.name === name)?.code ?? "??";

/** XP leagues — presentational, derived from star_points. */
export const LEAGUES = [
  { id: "kit", name: "Kit", icon: "🥚", at: 0 },
  { id: "cub", name: "Cub", icon: "🐣", at: 250 },
  { id: "fox", name: "Fox", icon: "🦊", at: 750 },
  { id: "ranger", name: "Ranger", icon: "🏅", at: 1500 },
  { id: "elder", name: "Elder", icon: "👑", at: 3000 },
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
  { id: "echo", name: "Echo Fox", desc: "Hear it, then choose what you heard", icon: "🎧", color: "var(--pink)" },
  { id: "builder", name: "Sentence Builder", desc: "Tap the words into the right order", icon: "🏗️", color: "var(--green)" },
] as const;

export type GameId = (typeof GAMES)[number]["id"];
