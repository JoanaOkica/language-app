import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createChallenge, listChallenges, listFriends, respondToChallenge,
} from "../lib/api";
import type { Challenge, PublicProfile } from "../lib/types";

export default function ChallengesPage() {
  const navigate = useNavigate();
  const [friends, setFriends] = useState<PublicProfile[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [opponent, setOpponent] = useState("");
  const [target, setTarget] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [f, c] = await Promise.all([
      listFriends().catch(() => []),
      listChallenges().catch(() => []),
    ]);
    setFriends(f);
    setChallenges(c);
    if (f.length && !opponent) setOpponent(f[0].id);
  }, [opponent]);

  useEffect(() => { void load(); }, [load]);

  async function start() {
    if (!opponent) return;
    setError(null);
    setBusy(true);
    try {
      await createChallenge(opponent, target);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function respond(id: string, accept: boolean) {
    try {
      await respondToChallenge(id, accept);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const active = challenges.filter((c) => c.status === "active" || c.status === "pending");
  const done = challenges.filter((c) => c.status === "completed");

  return (
    <>
      <div className="page-head">
        <h1>🏆 Challenges</h1>
        <p className="sub">Race a friend through FRED speaking sessions.</p>
      </div>

      {error && <div className="error" role="alert" style={{ marginTop: 14 }}>{error}</div>}

      <div className="card" style={{ marginTop: 16 }}>
        <h2>New FRED sprint</h2>
        {friends.length === 0 ? (
          <p className="empty">Add a friend first — challenges are friends-only.</p>
        ) : (
          <>
            <label htmlFor="opp">Opponent</label>
            <select id="opp" value={opponent} onChange={(e) => setOpponent(e.target.value)}>
              {friends.map((f) => <option key={f.id} value={f.id}>{f.display_name}</option>)}
            </select>

            <label htmlFor="target">First to…</label>
            <select id="target" value={target} onChange={(e) => setTarget(Number(e.target.value))}>
              {[3, 5, 10].map((n) => <option key={n} value={n}>{n} sessions</option>)}
            </select>

            <div className="btn-row">
              <button className="full" onClick={() => void start()} disabled={busy}>
                {busy ? "Sending…" : "Send challenge"}
              </button>
            </div>
          </>
        )}
      </div>

      {active.length > 0 && (
        <>
          <p className="section-title">In progress</p>
          {active.map((c) => (
            <div className="card" key={c.id}>
              <div className="row between">
                <h2>vs {c.opponent_name}</h2>
                <span className="pill-count">{c.status}</span>
              </div>
              <p className="sub">First to {c.target_sessions} FRED sessions</p>

              <div className="row between" style={{ margin: "14px 0 4px" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 30, fontWeight: 700 }}>{c.my_score}</div>
                  <span className="sub">You</span>
                </div>
                <span className="sub">vs</span>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 30, fontWeight: 700 }}>{c.their_score}</div>
                  <span className="sub">{c.opponent_name}</span>
                </div>
              </div>

              {c.status === "pending" && c.i_am_opponent ? (
                <div className="btn-row">
                  <button className="grow" onClick={() => void respond(c.id, true)}>Accept</button>
                  <button className="grow outline" onClick={() => void respond(c.id, false)}>Decline</button>
                </div>
              ) : c.status === "pending" ? (
                <p className="sub" style={{ textAlign: "center" }}>Waiting for {c.opponent_name} to accept…</p>
              ) : (
                <div className="btn-row">
                  <button className="full" onClick={() => navigate(`/talk?challenge=${c.id}`)}>
                    🎙️ Do a session
                  </button>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {done.length > 0 && (
        <>
          <p className="section-title">Finished</p>
          <div className="card">
            {done.map((c) => (
              <div className="friend" key={c.id}>
                <div className="grow">
                  <div style={{ fontWeight: 800 }}>vs {c.opponent_name}</div>
                  <span className="sub">{c.my_score} – {c.their_score}</span>
                </div>
                <span className="pill-count">
                  {c.winner_id && !c.i_am_opponent && c.my_score >= c.their_score ? "🏆 Won" : "Finished"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
