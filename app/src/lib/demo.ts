/**
 * In-memory backend used only when no Supabase project is configured.
 * It mirrors the real API surface so every page can be exercised offline —
 * useful for design review and for running the UI without cloud credentials.
 */
import type {
  Challenge, FredSession, FriendRequest, LeaderboardRow, Profile,
  PublicProfile, Task, UserStats, VocabWord,
} from "./types";

const uid = () => crypto.randomUUID();
const ME = "00000000-0000-4000-8000-000000000001";

interface DemoState {
  signedIn: boolean;
  profile: Profile;
  stats: UserStats;
  tasks: Task[];
  vocab: VocabWord[];
  sessions: FredSession[];
  friends: PublicProfile[];
  requests: FriendRequest[];
  challenges: Challenge[];
}

const seedWords: Array<[string, string, string, string, string]> = [
  ["Bocadillo", "sandwich", "noun", "Quiero un bocadillo de jamón.", "I want a ham sandwich."],
  ["Cuenta", "the bill", "noun", "La cuenta, por favor.", "The bill, please."],
  ["Pedir", "to order", "verb", "Voy a pedir un café.", "I'm going to order a coffee."],
  ["Para llevar", "to take away", "phrase", "¿Es para llevar?", "Is it to take away?"],
  ["Aguacate", "avocado", "noun", "Con aguacate, por favor.", "With avocado, please."],
];

export const state: DemoState = {
  signedIn: false,
  profile: {
    id: ME, username: "joana", display_name: "Joana", avatar_url: null,
    native_language: "English", target_language: "Spanish",
    level: "A2", is_public: true, onboarded: false,
  },
  stats: {
    user_id: ME, star_points: 240, streak_current: 4, streak_longest: 9,
    last_activity_date: new Date().toISOString().slice(0, 10),
    mascot_level: 2, equipped_outfit: "explorer",
    unlocked_outfits: ["default", "explorer"],
  },
  tasks: [{ id: uid(), title: "Ordering a sandwich", status: "generated", created_at: new Date().toISOString() }],
  vocab: seedWords.map(([word, translation, pos, sentence, st], i) => ({
    id: uid(), word, translation, part_of_speech: pos,
    example_sentence: sentence, sentence_translation: st,
    task_context: "Ordering a sandwich", level: "A2" as const,
    created_at: new Date(Date.now() - i * 36e5).toISOString(),
  })),
  sessions: [],
  friends: [
    { id: uid(), username: "marco", display_name: "Marco", avatar_url: null, star_points: 980, streak_current: 12, mascot_level: 3 },
    { id: uid(), username: "aiko", display_name: "Aiko", avatar_url: null, star_points: 430, streak_current: 5, mascot_level: 2 },
  ],
  requests: [
    { connection_id: uid(), id: uid(), username: "lena", display_name: "Lena", avatar_url: null, star_points: 610, streak_current: 8, mascot_level: 2 },
  ],
  challenges: [],
};

const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));

/** Canned generations keyed by activity, with a generic fallback. */
const LIBRARY: Record<string, Array<[string, string, string, string, string]>> = {
  "checking into a hotel": [
    ["Reserva", "reservation", "noun", "Tengo una reserva.", "I have a reservation."],
    ["Llave", "key", "noun", "¿Me da la llave?", "Can I have the key?"],
    ["Habitación", "room", "noun", "Una habitación doble, por favor.", "A double room, please."],
    ["Equipaje", "luggage", "noun", "¿Dónde dejo el equipaje?", "Where do I leave my luggage?"],
  ],
  "asking for directions": [
    ["Izquierda", "left", "noun", "Gira a la izquierda.", "Turn left."],
    ["Cerca", "near", "adverb", "¿Está cerca de aquí?", "Is it near here?"],
    ["Estación", "station", "noun", "¿Dónde está la estación?", "Where is the station?"],
    ["Perdido", "lost", "adjective", "Estoy perdido.", "I am lost."],
  ],
};

/**
 * Readers return shallow copies: the store mutates objects in place, and React
 * skips a re-render when setState receives the identical reference.
 */
export const demo = {
  async signIn() { await wait(); state.signedIn = true; return state.profile; },
  async signUp() { await wait(); state.signedIn = true; state.profile.onboarded = false; return state.profile; },
  async signOut() { state.signedIn = false; },
  session: () => (state.signedIn ? { userId: ME } : null),

  async getProfile() { await wait(120); return { ...state.profile }; },
  async getStats() { await wait(120); return { ...state.stats }; },
  async updateProfile(patch: Partial<Profile>) {
    await wait(200);
    Object.assign(state.profile, patch);
    return { ...state.profile };
  },

  async listTasks() { await wait(120); return state.tasks.map((t) => ({ ...t })); },
  async createTask(title: string) {
    await wait(150);
    const task: Task = { id: uid(), title, status: "requested", created_at: new Date().toISOString() };
    state.tasks.unshift(task);
    return task;
  },
  async generateVocabulary(taskId: string, title: string) {
    await wait(1100);
    const rows = LIBRARY[title.trim().toLowerCase()] ?? seedWords;
    const created = rows.map(([word, translation, pos, sentence, st]) => ({
      id: uid(), word, translation, part_of_speech: pos,
      example_sentence: sentence, sentence_translation: st,
      task_context: title, level: state.profile.level,
      created_at: new Date().toISOString(),
    }));
    state.vocab.push(...created);
    const task = state.tasks.find((t) => t.id === taskId);
    if (task) task.status = "generated";
    return created;
  },

  async listVocabulary() { await wait(120); return state.vocab.map((w) => ({ ...w })); },
  async deleteWord(id: string) {
    await wait(100);
    state.vocab = state.vocab.filter((w) => w.id !== id);
  },

  async fredTurn(prompt: string, challengeId: string | null) {
    await wait(1200);
    const replies = [
      "Quiero un bocadillo de jamón, por favor.",
      "Un café con leche, gracias.",
      "Para llevar, por favor.",
    ];
    const idx = Math.min(state.sessions.length, replies.length - 1);
    const score = [82, 88, 91][idx] ?? 85;
    const session: FredSession = {
      id: uid(), prompt,
      user_response_text: replies[idx],
      analysis_text:
        "Good sentence structure and correct use of the article. Watch the Spanish 'j' " +
        "in “jamón” — it is softer than in English. Grammar is solid for your level.",
      performance_score: score,
      score_breakdown: { pronunciation: score - 6, grammar: score + 4, fluency: score - 2 },
      created_at: new Date().toISOString(),
    };
    state.sessions.unshift(session);
    state.stats.star_points += Math.round(score / 10);
    if (challengeId) {
      const c = state.challenges.find((x) => x.id === challengeId);
      if (c && c.status === "active") {
        c.my_score += 1;
        if (Math.random() > 0.5) c.their_score += 1;
        if (c.my_score >= c.target_sessions) { c.status = "completed"; c.winner_id = ME; state.stats.star_points += 20; }
      }
    }
    return {
      sessionId: session.id,
      transcript: session.user_response_text!,
      analysis: session.analysis_text!,
      score,
      breakdown: session.score_breakdown!,
      nextPrompt: ["Muy bien. ¿Y para beber?", "Perfecto. ¿Para llevar o para tomar aquí?", "¡Excelente trabajo hoy!"][idx],
      starsAwarded: Math.round(score / 10),
    };
  },
  async listSessions() { await wait(120); return state.sessions.map((s) => ({ ...s })); },

  async equipOutfit(outfit: string) {
    await wait(150);
    if (state.stats.unlocked_outfits.includes(outfit)) state.stats.equipped_outfit = outfit;
    return { ...state.stats };
  },

  async searchProfiles(q: string) {
    await wait(300);
    if (q.trim().length < 2) return [];
    return [{
      id: uid(), username: q.trim().toLowerCase(),
      display_name: q.trim().charAt(0).toUpperCase() + q.trim().slice(1),
      avatar_url: null, star_points: 120, streak_current: 3, mascot_level: 1,
    }];
  },
  async listFriends() { await wait(120); return state.friends.map((f) => ({ ...f })); },
  async listRequests() { await wait(120); return state.requests.map((r) => ({ ...r })); },
  async sendRequest() { await wait(200); },
  async respondRequest(connectionId: string, accept: boolean) {
    await wait(200);
    const i = state.requests.findIndex((r) => r.connection_id === connectionId);
    if (i > -1) {
      if (accept) state.friends.push(state.requests[i]);
      state.requests.splice(i, 1);
    }
  },
  async leaderboard(): Promise<LeaderboardRow[]> {
    await wait(150);
    return [
      ...state.friends.map((f) => ({
        id: f.id, display_name: f.display_name, avatar_url: f.avatar_url,
        star_points: f.star_points, streak_current: f.streak_current, is_me: false,
      })),
      {
        id: ME, display_name: state.profile.display_name, avatar_url: null,
        star_points: state.stats.star_points, streak_current: state.stats.streak_current, is_me: true,
      },
    ].sort((a, b) => b.star_points - a.star_points);
  },

  async listChallenges() { await wait(120); return state.challenges.map((c) => ({ ...c })); },
  async createChallenge(opponentId: string, target: number) {
    await wait(250);
    const opp = state.friends.find((f) => f.id === opponentId) ?? state.friends[0];
    const c: Challenge = {
      id: uid(), kind: "fred_sprint", status: "active", target_sessions: target,
      my_score: 0, their_score: 0, winner_id: null,
      opponent_id: opp.id, opponent_name: opp.display_name, opponent_avatar: null,
      i_am_opponent: false,
      expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
    };
    state.challenges.unshift(c);
    return c;
  },
  async respondChallenge(id: string, accept: boolean) {
    await wait(200);
    const c = state.challenges.find((x) => x.id === id);
    if (c) c.status = accept ? "active" : "declined";
  },
};
