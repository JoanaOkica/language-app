/**
 * Caller verification and Supabase client construction.
 *
 * Rule: the user id is *always* derived from the verified JWT, never from the
 * request body. Any function that accepted a `userId` parameter would let one
 * user act as another.
 */
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export interface Caller {
  userId: string;
  /** Acts as the user; every query is still filtered by RLS. */
  asUser: SupabaseClient;
  /** Bypasses RLS. Use only for validated, server-authoritative writes. */
  asService: SupabaseClient;
}

export class AuthError extends Error {}

export async function requireUser(req: Request): Promise<Caller> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    throw new AuthError("missing_token");
  }

  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Validates the signature and expiry against the auth server.
  const { data, error } = await asUser.auth.getUser();
  if (error || !data.user) {
    throw new AuthError("invalid_token");
  }

  const asService = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { userId: data.user.id, asUser, asService };
}
