/**
 * Single data-access layer for the UI.
 *
 * Every call either hits Supabase (RLS-protected reads/writes, Edge Functions
 * for anything involving the AI or scoring) or the in-memory demo store when
 * no project is configured. Pages never import the Supabase client directly,
 * so authorisation logic stays in one auditable place.
 */
import { db, isDemo, FUNCTIONS, APP_TAG, BUCKET_SPEECH } from "./supabase";
import { demo } from "./demo";
import type {
  Challenge, FredSession, FredTurnResult, FriendRequest, GenerateResult,
  LeaderboardRow, Profile, PublicProfile, Task, UserStats, VocabWord,
} from "./types";

export type VocabSort = "alpha" | "recent";
export type VocabRange = "all" | "today" | "week";

/* ------------------------------- auth ------------------------------- */

export const auth = {
  async currentUserId(): Promise<string | null> {
    if (isDemo) return demo.session()?.userId ?? null;
    const { data } = await db().auth.getSession();
    return data.session?.user.id ?? null;
  },

  async signIn(email: string, password: string): Promise<void> {
    if (isDemo) { await demo.signIn(); return; }
    const { error } = await db().auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  },

  /**
   * Creates the account and sends the confirmation email. With confirmations
   * enabled Supabase returns no session, so the user cannot get in until they
   * click the link — and an unconfirmed account is purged after 24 hours.
   *
   * The `app` tag scopes that purge to Linguafox signups only, so it can never
   * touch accounts created by the other projects sharing this Supabase instance.
   */
  async signUp(email: string, password: string): Promise<void> {
    if (isDemo) { await demo.signUp(); return; }
    const { error } = await db().auth.signUp({
      email,
      password,
      options: {
        data: { app: APP_TAG },
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    if (error) throw new Error(error.message);
  },

  /** Re-sends the confirmation email if the first one was lost. */
  async resendConfirmation(email: string): Promise<void> {
    if (isDemo) return;
    const { error } = await db().auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    if (error) throw new Error(error.message);
  },

  /** Starts the forgotten-password flow. */
  async requestPasswordReset(email: string): Promise<void> {
    if (isDemo) return;
    const { error } = await db().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw new Error(error.message);
  },

  /** Completes a reset: only works while the recovery link's session is active. */
  async updatePassword(password: string): Promise<void> {
    if (isDemo) return;
    const { error } = await db().auth.updateUser({ password });
    if (error) throw new Error(error.message);
  },

  /** True once the signed-in user's address has been verified. */
  async isEmailConfirmed(): Promise<boolean> {
    if (isDemo) return true;
    const { data } = await db().auth.getUser();
    return Boolean(data.user?.email_confirmed_at);
  },

  async signOut(): Promise<void> {
    if (isDemo) { await demo.signOut(); return; }
    await db().auth.signOut();
  },

  onChange(cb: () => void): () => void {
    if (isDemo) return () => {};
    const { data } = db().auth.onAuthStateChange(() => cb());
    return () => data.subscription.unsubscribe();
  },
};

/* ------------------------------ profile ------------------------------ */

/**
 * Creates the profile and stats rows on first use, replacing the usual
 * `on auth.users` trigger — which would fire for every signup in this shared
 * project, including the other apps'. The function refuses if the address is
 * unconfirmed, so confirmation is enforced in the database too, not just by
 * the Auth settings.
 */
export async function ensureProfile(): Promise<Profile | null> {
  if (isDemo) return demo.getProfile();
  const { data, error } = await db().rpc("ensure_profile");
  if (error) {
    if (error.message?.includes("email_not_confirmed")) {
      throw new Error("email_not_confirmed");
    }
    throw new Error(error.message);
  }
  return data as Profile;
}

export async function getProfile(): Promise<Profile | null> {
  if (isDemo) return demo.getProfile();
  const uid = await auth.currentUserId();
  if (!uid) return null;
  const { data, error } = await db().from("profiles").select("*").eq("id", uid).single();
  if (error) throw new Error(error.message);
  return data as Profile;
}

export async function getStats(): Promise<UserStats | null> {
  if (isDemo) return demo.getStats();
  const uid = await auth.currentUserId();
  if (!uid) return null;
  const { data, error } = await db().from("user_stats").select("*").eq("user_id", uid).single();
  if (error) throw new Error(error.message);
  return data as UserStats;
}

export async function updateProfile(patch: Partial<Profile>): Promise<Profile> {
  if (isDemo) return demo.updateProfile(patch);
  const uid = await auth.currentUserId();
  if (!uid) throw new Error("Not signed in");
  const { data, error } = await db()
    .from("profiles").update(patch).eq("id", uid).select().single();
  if (error) throw new Error(error.message);
  return data as Profile;
}

/**
 * Permanent account deletion. Runs server-side so storage objects are purged
 * before the auth user is removed and the cascade wipes every table.
 * The current password is required: a stolen session alone must not be able to
 * destroy an account.
 */
export async function deleteAccount(password: string): Promise<void> {
  if (isDemo) { await demo.deleteAccount(); return; }
  const { error } = await db().functions.invoke(FUNCTIONS.deleteAccount, {
    body: { password },
  });
  if (error) {
    const message = await readFunctionError(error);
    throw new Error(message === "password incorrect"
      ? "That password isn't correct."
      : message);
  }
  await db().auth.signOut();
}

/* ------------------------- tasks & vocabulary ------------------------- */

export async function listTasks(): Promise<Task[]> {
  if (isDemo) return demo.listTasks();
  const { data, error } = await db()
    .from("tasks").select("id, title, status, created_at")
    .order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return data as Task[];
}

export async function createTask(title: string): Promise<Task> {
  if (isDemo) return demo.createTask(title);
  const uid = await auth.currentUserId();
  if (!uid) throw new Error("Not signed in");
  const profile = await getProfile();
  const { data, error } = await db()
    .from("tasks")
    .insert({ user_id: uid, title, level: profile?.level ?? "beginner" })
    .select("id, title, status, created_at")
    .single();
  if (error) throw new Error(error.message);
  return data as Task;
}

/**
 * Server-side generation. Returns how the result was applied: brand-new cards,
 * new contexts added to words already known, and repeats that changed nothing.
 */
export async function generateVocabulary(taskId: string, title: string): Promise<GenerateResult> {
  if (isDemo) return demo.generateVocabulary(taskId, title);
  const { data, error } = await db().functions.invoke(FUNCTIONS.generateVocabulary, {
    body: { taskId },
  });
  if (error) throw new Error(await readFunctionError(error));
  return {
    newWords: data?.newWords ?? 0,
    newContexts: data?.newContexts ?? 0,
    alreadyKnown: data?.alreadyKnown ?? 0,
  };
}

export async function listVocabulary(
  sort: VocabSort = "alpha",
  range: VocabRange = "all",
): Promise<VocabWord[]> {
  if (isDemo) {
    const all = await demo.listVocabulary();
    return sortAndFilter(all, sort, range);
  }
  const { data, error } = await db().rpc("list_vocabulary", {
    p_sort: sort,
    p_since: rangeStart(range),
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as VocabWord[];
}

export async function deleteWord(id: string): Promise<void> {
  if (isDemo) return demo.deleteWord(id);
  const { error } = await db().from("vocabulary").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* -------------------------------- FRED -------------------------------- */

export async function submitFredTurn(
  audio: Blob,
  prompt: string,
  challengeId: string | null,
): Promise<FredTurnResult> {
  if (isDemo) return demo.fredTurn(prompt, challengeId);

  const uid = await auth.currentUserId();
  if (!uid) throw new Error("Not signed in");

  const audioPath = `${uid}/${crypto.randomUUID()}.webm`;
  const { error: upErr } = await db().storage
    .from(BUCKET_SPEECH)
    .upload(audioPath, audio, { contentType: "audio/webm", upsert: false });
  if (upErr) throw new Error(upErr.message);

  const { data, error } = await db().functions.invoke(FUNCTIONS.fredTurn, {
    body: { audioPath, prompt, challengeId },
  });
  if (error) throw new Error(await readFunctionError(error));
  return data as FredTurnResult;
}

export async function listSessions(): Promise<FredSession[]> {
  if (isDemo) return demo.listSessions();
  const { data, error } = await db()
    .from("fred_sessions").select("*")
    .order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return data as FredSession[];
}

/* -------------------------------- games -------------------------------- */

/** Points are capped and re-validated server-side; see docs/SECURITY.md §3. */
export async function awardGamePoints(points: number, gameId: string): Promise<void> {
  if (isDemo) { await demo.awardGamePoints(points, gameId); return; }
  const { error } = await db().functions.invoke(FUNCTIONS.awardGamePoints, {
    body: { points },
  });
  if (error) throw new Error(await readFunctionError(error));
  rememberBest(gameId, points);
}

const BEST_KEY = "game-bests";
export function gameBests(): Record<string, number> {
  if (isDemo) return demo.gameBests();
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function rememberBest(gameId: string, points: number) {
  const all = gameBests();
  all[gameId] = Math.max(all[gameId] ?? 0, points);
  try { localStorage.setItem(BEST_KEY, JSON.stringify(all)); } catch { /* ignore */ }
}

/* ------------------------------- social ------------------------------- */

export async function searchProfiles(query: string): Promise<PublicProfile[]> {
  if (isDemo) return demo.searchProfiles(query);
  if (query.trim().length < 2) return [];
  const { data, error } = await db().rpc("search_profiles", { p_query: query.trim() });
  if (error) throw new Error(error.message);
  return data as PublicProfile[];
}

export async function listFriends(): Promise<PublicProfile[]> {
  if (isDemo) return demo.listFriends();
  const { data, error } = await db().rpc("list_friends");
  if (error) throw new Error(error.message);
  return data as PublicProfile[];
}

export async function listRequests(): Promise<FriendRequest[]> {
  if (isDemo) return demo.listRequests();
  const { data, error } = await db().rpc("list_pending_requests");
  if (error) throw new Error(error.message);
  return data as FriendRequest[];
}

export async function sendFriendRequest(recipientId: string): Promise<void> {
  if (isDemo) return demo.sendRequest();
  const uid = await auth.currentUserId();
  if (!uid) throw new Error("Not signed in");
  const { error } = await db()
    .from("connections")
    .insert({ requester_id: uid, recipient_id: recipientId, status: "pending" });
  if (error) throw new Error(friendlyConnectionError(error.message));
}

export async function respondToRequest(connectionId: string, accept: boolean): Promise<void> {
  if (isDemo) return demo.respondRequest(connectionId, accept);
  const { error } = await db()
    .from("connections")
    .update({ status: accept ? "accepted" : "declined" })
    .eq("id", connectionId);
  if (error) throw new Error(error.message);
}

export async function leaderboard(): Promise<LeaderboardRow[]> {
  if (isDemo) return demo.leaderboard();
  const { data, error } = await db().rpc("friends_leaderboard");
  if (error) throw new Error(error.message);
  return data as LeaderboardRow[];
}

/* ----------------------------- challenges ----------------------------- */

export async function listChallenges(): Promise<Challenge[]> {
  if (isDemo) return demo.listChallenges();
  const { data, error } = await db().rpc("list_my_challenges");
  if (error) throw new Error(error.message);
  return data as Challenge[];
}

export async function createChallenge(opponentId: string, target: number): Promise<void> {
  if (isDemo) { await demo.createChallenge(opponentId, target); return; }
  const uid = await auth.currentUserId();
  if (!uid) throw new Error("Not signed in");
  const { error } = await db().from("challenges").insert({
    challenger_id: uid,
    opponent_id: opponentId,
    target_sessions: target,
    kind: "fred_sprint",
  });
  if (error) throw new Error(error.message);
}

export async function respondToChallenge(id: string, accept: boolean): Promise<void> {
  if (isDemo) return demo.respondChallenge(id, accept);
  const { error } = await db()
    .from("challenges")
    .update({ status: accept ? "active" : "declined" })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/* ------------------------------ helpers ------------------------------ */

function rangeStart(range: VocabRange): string | null {
  if (range === "all") return null;
  const d = new Date();
  if (range === "today") d.setHours(0, 0, 0, 0);
  else d.setDate(d.getDate() - 7);
  return d.toISOString();
}

function sortAndFilter(words: VocabWord[], sort: VocabSort, range: VocabRange): VocabWord[] {
  const since = rangeStart(range);
  const filtered = since ? words.filter((w) => w.created_at >= since) : [...words];
  return filtered.sort((a, b) =>
    sort === "alpha"
      ? a.word.localeCompare(b.word, undefined, { sensitivity: "base" })
      : b.created_at.localeCompare(a.created_at));
}

/** Surfaces the short error code an Edge Function returns, not a raw stack. */
async function readFunctionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await ctx.json();
      if (body?.error === "daily_limit_reached") return "You've hit today's limit — come back tomorrow.";
      if (body?.error) return String(body.error).replace(/_/g, " ");
    } catch { /* fall through */ }
  }
  return (error as Error)?.message ?? "Request failed";
}

function friendlyConnectionError(message: string): string {
  if (message.includes("connections_unique_pair_idx")) return "You're already connected with this person.";
  if (message.includes("connections_no_self")) return "You can't add yourself.";
  return message;
}
