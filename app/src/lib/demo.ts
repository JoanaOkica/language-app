/**
 * In-memory backend used only when no Supabase project is configured.
 * Mirrors the real API surface so every page works offline.
 *
 * Readers return shallow copies: the store mutates objects in place, and React
 * skips a re-render when setState receives the identical reference.
 */
import type {
  Challenge, FredSession, FriendRequest, GenerateResult, LeaderboardRow,
  Profile, PublicProfile, Task, UserStats, VocabWord, WordExample,
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
  bests: Record<string, number>;
}

function word(w: string, t: string, pos: string, ex: WordExample[], ageHours = 0): VocabWord {
  return {
    id: uid(), word: w, translation: t, part_of_speech: pos, level: "elementary",
    created_at: new Date(Date.now() - ageHours * 36e5).toISOString(), examples: ex,
  };
}

export const state: DemoState = {
  signedIn: false,
  profile: {
    id: ME, username: "joana", display_name: "joana", avatar: "fox",
    native_language: "English", target_language: "Spanish",
    level: "beginner", is_public: true, onboarded: false,
  },
  stats: {
    user_id: ME, star_points: 180, streak_current: 3, streak_longest: 9,
    last_activity_date: new Date().toISOString().slice(0, 10),
  },
  tasks: [],
  vocab: [
    word("café", "coffee", "noun", [
      { context: "Morning routine", sentence: "Tomo un café antes de salir.", translation: "I have a coffee before leaving." },
      { context: "Meeting a friend", sentence: "¿Nos tomamos un café el sábado?", translation: "Shall we get a coffee on Saturday?" },
    ], 30),
    word("comida", "food", "noun", [
      { context: "Working from a café", sentence: "La comida está deliciosa.", translation: "The food is delicious." },
    ], 5),
    word("reunión", "meeting", "noun", [
      { context: "Working from a café", sentence: "Tengo una reunión a las diez.", translation: "I have a meeting at ten." },
    ], 4),
  ],
  sessions: [],
  friends: [
    { id: uid(), username: "marco", display_name: "Marco", avatar: "bear", star_points: 980, streak_current: 12 },
    { id: uid(), username: "aiko", display_name: "Aiko", avatar: "panda", star_points: 430, streak_current: 5 },
  ],
  requests: [
    { connection_id: uid(), id: uid(), username: "lena", display_name: "Lena", avatar: "owl", star_points: 610, streak_current: 8 },
  ],
  challenges: [],
  bests: {},
};

const wait = (ms = 320) => new Promise((r) => setTimeout(r, ms));
const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** Canned generations keyed by activity, with a fallback. */
const LIBRARY: Record<string, Array<[string, string, string, string, string]>> = {
  "gym in the morning, then groceries": [
    ["gimnasio", "gym", "noun", "Voy al gimnasio a las siete.", "I go to the gym at seven."],
    ["pesas", "weights", "noun", "Levanto pesas tres veces por semana.", "I lift weights three times a week."],
    ["compras", "groceries", "noun", "Después hago las compras.", "Afterwards I do the groceries."],
    ["café", "coffee", "noun", "Un café rápido antes del gimnasio.", "A quick coffee before the gym."],
  ],
  "train to the airport, check in": [
    ["billete", "ticket", "noun", "¿Dónde compro el billete?", "Where do I buy the ticket?"],
    ["andén", "platform", "noun", "El tren sale del andén cinco.", "The train leaves from platform five."],
    ["equipaje", "luggage", "noun", "Tengo que facturar el equipaje.", "I have to check in my luggage."],
    ["puerta", "gate", "noun", "La puerta de embarque es la doce.", "The boarding gate is number twelve."],
  ],
};
const FALLBACK: Array<[string, string, string, string, string]> = [
  ["horario", "schedule", "noun", "Mi horario cambia cada día.", "My schedule changes every day."],
  ["tarde", "afternoon", "noun", "Por la tarde estoy libre.", "In the afternoon I am free."],
  ["café", "coffee", "noun", "Necesito un café ahora mismo.", "I need a coffee right now."],
  ["trabajo", "work", "noun", "Hoy tengo mucho trabajo.", "I have a lot of work today."],
];

export const demo = {
  async signIn() { await wait(); state.signedIn = true; return copy(state.profile); },
  async signUp() { await wait(); state.signedIn = true; state.profile.onboarded = false; return copy(state.profile); },
  async signOut() { state.signedIn = false; },
  session: () => (state.signedIn ? { userId: ME } : null),

  async getProfile() { await wait(110); return copy(state.profile); },
  async getStats() { await wait(110); return copy(state.stats); },
  async updateProfile(patch: Partial<Profile>) {
    await wait(180);
    Object.assign(state.profile, patch);
    return copy(state.profile);
  },
  async deleteAccount() {
    await wait(400);
    state.signedIn = false;
    state.vocab = [];
    state.sessions = [];
    state.stats = { ...state.stats, star_points: 0, streak_current: 0, streak_longest: 0 };
    state.profile.onboarded = false;
  },

  async listTasks() { await wait(110); return copy(state.tasks); },
  async createTask(title: string) {
    await wait(120);
    const task: Task = { id: uid(), title, status: "requested", created_at: new Date().toISOString() };
    state.tasks.unshift(task);
    return copy(task);
  },

  /**
   * Mirrors `upsert_vocabulary`: one card per word, a new context adds a
   * sentence to the existing card, a repeated context changes nothing.
   */
  async generateVocabulary(taskId: string, title: string): Promise<GenerateResult> {
    await wait(1000);
    const rows = LIBRARY[title.trim().toLowerCase()] ?? FALLBACK;
    const context = title.trim();
    let newWords = 0, newContexts = 0, alreadyKnown = 0;

    for (const [w, t, pos, sentence, translation] of rows) {
      const existing = state.vocab.find((v) => v.word.toLowerCase() === w.toLowerCase());
      if (!existing) {
        state.vocab.push(word(w, t, pos, [{ context, sentence, translation }]));
        newWords++;
      } else if (!existing.examples.some((e) => e.context.toLowerCase() === context.toLowerCase())) {
        existing.examples.push({ context, sentence, translation });
        newContexts++;
      } else {
        alreadyKnown++;
      }
    }
    const task = state.tasks.find((t) => t.id === taskId);
    if (task) task.status = "generated";
    return { newWords, newContexts, alreadyKnown };
  },

  async listVocabulary() { await wait(110); return copy(state.vocab); },
  async deleteWord(id: string) {
    await wait(90);
    state.vocab = state.vocab.filter((w) => w.id !== id);
  },

  async fredTurn(prompt: string, challengeId: string | null) {
    await wait(1100);
    const replies = [
      "Quiero un bocadillo de jamón, por favor.",
      "Un café con leche, gracias.",
      "Para llevar, por favor.",
    ];
    const idx = Math.min(state.sessions.length, replies.length - 1);
    const score = [82, 88, 91][idx] ?? 85;
    const session: FredSession = {
      id: uid(), prompt, user_response_text: replies[idx],
      analysis_text:
        "Good sentence structure and correct use of the article. Watch the Spanish 'j' " +
        "in “jamón” — it is softer than in English. Grammar is solid for your level.",
      performance_score: score,
      created_at: new Date().toISOString(),
    };
    state.sessions.unshift(session);
    state.stats.star_points += Math.round(score / 10);
    if (challengeId) {
      const c = state.challenges.find((x) => x.id === challengeId);
      if (c && c.status === "active") {
        c.my_score += 1;
        if (Math.random() > 0.5) c.their_score += 1;
        if (c.my_score >= c.target_sessions) {
          c.status = "completed"; c.winner_id = ME; state.stats.star_points += 20;
        }
      }
    }
    return {
      sessionId: session.id,
      transcript: session.user_response_text!,
      analysis: session.analysis_text!,
      score,
      breakdown: { pronunciation: score - 6, grammar: score + 4, fluency: score - 2 },
      nextPrompt: ["Muy bien. ¿Y para beber?", "Perfecto. ¿Para llevar o para tomar aquí?", "¡Excelente trabajo hoy!"][idx],
      starsAwarded: Math.round(score / 10),
    };
  },
  async listSessions() { await wait(110); return copy(state.sessions); },

  async awardGamePoints(points: number, gameId: string) {
    await wait(200);
    state.stats.star_points += points;
    state.bests[gameId] = Math.max(state.bests[gameId] ?? 0, points);
    return copy(state.stats);
  },
  gameBests: () => ({ ...state.bests }),

  async searchProfiles(q: string) {
    await wait(260);
    if (q.trim().length < 2) return [];
    return [{
      id: uid(), username: q.trim().toLowerCase(),
      display_name: q.trim().charAt(0).toUpperCase() + q.trim().slice(1),
      avatar: "tiger", star_points: 120, streak_current: 3,
    }];
  },
  async listFriends() { await wait(110); return copy(state.friends); },
  async listRequests() { await wait(110); return copy(state.requests); },
  async sendRequest() { await wait(180); },
  async respondRequest(connectionId: string, accept: boolean) {
    await wait(180);
    const i = state.requests.findIndex((r) => r.connection_id === connectionId);
    if (i > -1) {
      if (accept) state.friends.push(state.requests[i]);
      state.requests.splice(i, 1);
    }
  },
  async leaderboard(): Promise<LeaderboardRow[]> {
    await wait(140);
    return [
      ...state.friends.map((f) => ({
        id: f.id, display_name: f.display_name, avatar: f.avatar,
        star_points: f.star_points, streak_current: f.streak_current, is_me: false,
      })),
      {
        id: ME, display_name: state.profile.display_name, avatar: state.profile.avatar,
        star_points: state.stats.star_points, streak_current: state.stats.streak_current, is_me: true,
      },
    ].sort((a, b) => b.star_points - a.star_points);
  },

  async listChallenges() { await wait(110); return copy(state.challenges); },
  async createChallenge(opponentId: string, target: number) {
    await wait(220);
    const opp = state.friends.find((f) => f.id === opponentId) ?? state.friends[0];
    const c: Challenge = {
      id: uid(), kind: "fred_sprint", status: "active", target_sessions: target,
      my_score: 0, their_score: 0, winner_id: null,
      opponent_id: opp.id, opponent_name: opp.display_name, opponent_avatar: opp.avatar,
      i_am_opponent: false,
      expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
    };
    state.challenges.unshift(c);
    return copy(c);
  },
  async respondChallenge(id: string, accept: boolean) {
    await wait(180);
    const c = state.challenges.find((x) => x.id === id);
    if (c) c.status = accept ? "active" : "declined";
  },
};
