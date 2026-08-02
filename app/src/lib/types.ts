export type FluencyLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type TaskStatus = "requested" | "generating" | "generated" | "error";
export type ChallengeStatus = "pending" | "active" | "completed" | "declined" | "expired";

export interface Profile {
  id: string;
  username: string | null;
  display_name: string;
  avatar_url: string | null;
  native_language: string;
  target_language: string;
  level: FluencyLevel;
  is_public: boolean;
  onboarded: boolean;
}

export interface UserStats {
  user_id: string;
  star_points: number;
  streak_current: number;
  streak_longest: number;
  last_activity_date: string | null;
  mascot_level: number;
  equipped_outfit: string;
  unlocked_outfits: string[];
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  created_at: string;
}

export interface VocabWord {
  id: string;
  word: string;
  translation: string;
  part_of_speech: string | null;
  example_sentence: string | null;
  sentence_translation: string | null;
  task_context: string | null;
  level: FluencyLevel;
  created_at: string;
}

export interface FredSession {
  id: string;
  prompt: string | null;
  user_response_text: string | null;
  analysis_text: string | null;
  performance_score: number | null;
  score_breakdown: { pronunciation: number; grammar: number; fluency: number } | null;
  created_at: string;
}

export interface PublicProfile {
  id: string;
  username: string | null;
  display_name: string;
  avatar_url: string | null;
  star_points: number;
  streak_current: number;
  mascot_level: number;
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
  opponent_avatar: string | null;
  i_am_opponent: boolean;
  expires_at: string;
}

export interface LeaderboardRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
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

export const OUTFITS = [
  { id: "default", name: "Default", icon: "🦌", streak: 0 },
  { id: "explorer", name: "Explorer", icon: "🧭", streak: 3 },
  { id: "scholar", name: "Scholar", icon: "🎓", streak: 7 },
  { id: "globetrotter", name: "Globetrotter", icon: "🌍", streak: 14 },
  { id: "legend", name: "Legend", icon: "👑", streak: 30 },
] as const;
