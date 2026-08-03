import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * When no Supabase project is configured the app runs against an in-memory
 * store so the UI can be demoed offline. Real deployments always have these
 * values set, so demo mode can never silently activate in production.
 */
export const isDemo = !url || !anonKey;

/**
 * Every Cat's Tongue object lives in its own Postgres schema, so this project can
 * share a Supabase instance with other apps without colliding with them.
 */
export const SCHEMA = "cats_tongue";
export const BUCKET_SPEECH = "cats-tongue-speech";

export const supabase = isDemo
  ? null
  : createClient(url!, anonKey!, {
      db: { schema: SCHEMA },
      auth: {
        // Tokens live in localStorage and are auto-refreshed. `detectSessionInUrl`
        // handles the OAuth/magic-link redirect hand-off.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });

/** Narrowing helper so call sites don't repeat the null check. */
export function db() {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

export const FUNCTIONS = {
  fredTurn: "fred-turn",
  generateVocabulary: "generate-vocabulary",
  awardGamePoints: "award-game-points",
  deleteAccount: "delete-account",
} as const;

/**
 * Tags the account as ours in `raw_user_meta_data`. The unconfirmed-signup
 * purge is scoped by this, so it can never delete another app's pending users.
 */
export const APP_TAG = "cats_tongue";
