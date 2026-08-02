/**
 * Single data-access layer for the UI.
 *
 * Every call either hits Supabase (RLS-protected reads/writes, Edge Functions
 * for anything involving the AI or scoring) or the in-memory demo store when
 * no project is configured. Pages never import the Supabase client directly,
 * so authorisation logic stays in one auditable place.
 */
import { db, isDemo, FUNCTIONS } from "./supabase";
import { demo } from "./demo";
import type {
  Challenge, FredSession, FredTurnResult, FriendRequest, LeaderboardRow,
  Profile, PublicProfile, Task, UserStats, VocabWord,
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

  async signUp(email: string, password: string): Promise<void> {
    if (isDemo) { await demo.signUp(); return; }
    const { error } = await db().auth.signUp({ email, password });
    if (error) throw new Error(error.message);
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
  // Only profile-owned fields are sent; stats columns live in another table
  // the client has no write grant on.
  const { data, error } = await db()
    .from("profiles")
    .update(patch)
    .eq("id", uid)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Profile;
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
    .insert({ user_id: uid, title, level: profile?.level ?? "A1" })
    .select("id, title, status, created_at")
    .single();
  if (error) throw new Error(error.message);
  return data as Task;
}

/** Runs on the server: the AI key and the token budget never touch the client. */
export async function generateVocabulary(taskId: string, title: string): Promise<VocabWord[]> {
  if (isDemo) return demo.generateVocabulary(taskId, title);
  const { data, error } = await db().functions.invoke(FUNCTIONS.generateVocabulary, {
    body: { taskId },
  });
  if (error) throw new Error(await readFunctionError(error));
  return (data?.items ?? []) as VocabWord[];
}

export async function listVocabulary(
  sort: VocabSort = "alpha",
  range: VocabRange = "all",
): Promise<VocabWord[]> {
  if (isDemo) {
    const all = await demo.listVocabulary();
    return sortAndFilter(all, sort, range);
  }
  let query = db().from("vocabulary").select("*");
  const since = rangeStart(range);
  if (since) query = query.gte("created_at", since);
  query = sort === "alpha"
    ? query.order("word", { ascending: true })
    : query.order("created_at", { ascending: false });
  const { data, error } = await query.limit(500);
  if (error) throw new Error(error.message);
  return data as VocabWord[];
}

export async function deleteWord(id: string): Promise<void> {
  if (isDemo) return demo.deleteWord(id);
  const { error } = await db().from("vocabulary").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* -------------------------------- FRED -------------------------------- */

/**
 * Uploads the recording to the caller's own storage folder, then asks the
 * Edge Function to transcribe, analyse and score it.
 */
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
    .from("speech")
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

/* ------------------------------- mascot ------------------------------- */

export async function equipOutfit(outfit: string): Promise<UserStats> {
  if (isDemo) return demo.equipOutfit(outfit);
  // The RPC verifies the outfit is actually unlocked before applying it.
  const { data, error } = await db().rpc("equip_outfit", { p_outfit: outfit });
  if (error) throw new Error(error.message);
  return data as UserStats;
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
      if (body?.error === "daily_limit_reached") return "You've hit today's practice limit.";
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
