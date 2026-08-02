import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listVocabulary, leaderboard } from "../lib/api";
import { useSession } from "../lib/session";
import { OUTFITS } from "../lib/types";
import type { LeaderboardRow } from "../lib/types";

export default function HomePage() {
  const { profile, stats } = useSession();
  const navigate = useNavigate();
  const [wordCount, setWordCount] = useState<number | null>(null);
  const [board, setBoard] = useState<LeaderboardRow[]>([]);

  useEffect(() => {
    void listVocabulary().then((w) => setWordCount(w.length)).catch(() => setWordCount(0));
    void leaderboard().then(setBoard).catch(() => setBoard([]));
  }, []);

  const outfit = OUTFITS.find((o) => o.id === stats?.equipped_outfit) ?? OUTFITS[0];
  const nextOutfit = OUTFITS.find((o) => !stats?.unlocked_outfits.includes(o.id));

  return (
    <>
      <h1>Hi {profile?.display_name || "there"} 👋</h1>
      <p className="sub">{profile?.target_language} · Level {profile?.level}</p>

      <div className="card tint" style={{ marginTop: 18 }}>
        <div className="row between">
          <div>
            <h3>🔥 Streak</h3>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{stats?.streak_current ?? 0}</div>
            <span className="sub">days · best {stats?.streak_longest ?? 0}</span>
          </div>
          <div style={{ textAlign: "right" }}>
            <h3>⭐ Star Points</h3>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{stats?.star_points ?? 0}</div>
            <span className="sub">{wordCount ?? "…"} words learned</span>
          </div>
        </div>
      </div>

      <p className="section-title">Today's focus</p>
      <div className="card">
        <h2>What are you doing today?</h2>
        <p className="sub">Describe an activity and we'll build the exact words for it.</p>
        <div className="btn-row" style={{ flexDirection: "column" }}>
          <button className="full" onClick={() => navigate("/tasks")}>➕ New vocabulary task</button>
          <button className="full ghost" onClick={() => navigate("/fred")}>🎙️ Practice speaking with FRED</button>
        </div>
      </div>

      <p className="section-title">Your gazelle</p>
      <div className="card">
        <div className="row between">
          <div className="row">
            <span style={{ fontSize: 40 }}>{outfit.icon}</span>
            <div>
              <h3>Level {stats?.mascot_level ?? 1} · {outfit.name}</h3>
              <span className="sub">
                {nextOutfit
                  ? `${nextOutfit.streak}-day streak unlocks ${nextOutfit.name}`
                  : "Every outfit unlocked 👑"}
              </span>
            </div>
          </div>
          <button className="sm subtle" onClick={() => navigate("/mascot")}>Open</button>
        </div>
      </div>

      {board.length > 0 && (
        <>
          <p className="section-title">Friends leaderboard</p>
          <div className="card">
            {board.slice(0, 5).map((row, i) => (
              <div className="list-item row" key={row.id}>
                <span className="sub" style={{ width: 18 }}>{i + 1}</span>
                <span className="avatar">{row.display_name.charAt(0).toUpperCase()}</span>
                <div className="grow">
                  <div className="word">{row.display_name}{row.is_me && " (you)"}</div>
                  <span className="trans">🔥 {row.streak_current} day streak</span>
                </div>
                <span className="pill">⭐ {row.star_points}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
