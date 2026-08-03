/**
 * award-game-points — Star Points from mini-games (feature D).
 *
 * A client can always lie about a game result, so the damage is bounded rather
 * than trusted: the award is capped per call, capped per day, and written by
 * the server-authoritative `award_points` function. Raising the reported score
 * cannot unlock anything faster than the daily ceiling allows.
 */
import { preflight, json, fail } from "../_shared/http.ts";
import { requireUser, AuthError } from "../_shared/auth.ts";

const MAX_POINTS_PER_GAME = 50;
const MAX_GAMES_PER_DAY = Number(Deno.env.get("DAILY_GAME_LIMIT") ?? "20");

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed");

  let caller;
  try {
    caller = await requireUser(req);
  } catch (e) {
    return fail(req, 401, e instanceof AuthError ? e.message : "unauthorized");
  }
  const { userId, asService } = caller;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(req, 400, "invalid_json");
  }

  const points = Math.floor(Number(body.points));
  if (!Number.isFinite(points) || points < 1 || points > MAX_POINTS_PER_GAME) {
    return fail(req, 400, "invalid_points");
  }

  const { error: quotaError } = await asService.rpc("consume_daily_quota", {
    p_user: userId,
    p_kind: "game",
    p_limit: MAX_GAMES_PER_DAY,
  });
  if (quotaError) {
    if (quotaError.message?.includes("daily_quota_exceeded")) {
      return fail(req, 429, "daily_limit_reached");
    }
    return fail(req, 500, "quota_check_failed", quotaError);
  }

  const { data, error } = await asService.rpc("award_points", {
    p_user: userId,
    p_stars: points,
  });
  if (error) return fail(req, 500, "award_failed", error);

  return json(req, { stats: data });
});
