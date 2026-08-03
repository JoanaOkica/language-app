import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { gameBests, listVocabulary } from "../lib/api";
import { useSession } from "../lib/session";
import { GAMES, leagueFor } from "../lib/types";

export default function GamesPage() {
  const { stats } = useSession();
  const navigate = useNavigate();
  const [wordCount, setWordCount] = useState<number | null>(null);
  const bests = gameBests();

  useEffect(() => {
    void listVocabulary().then((w) => setWordCount(w.length)).catch(() => setWordCount(0));
  }, []);

  const league = leagueFor(stats?.star_points ?? 0);
  const enoughWords = (wordCount ?? 0) >= 4;

  return (
    <>
      <div className="page-head">
        <h1>Games</h1>
        <p className="sub">Little wins, every day</p>
      </div>

      <div className="card league-card">
        <div className="league">
          <span className="egg">{league.current.icon}</span>
          <div className="grow">
            <h3>{league.current.name} league</h3>
            <div className="bar-sm"><i style={{ width: `${league.progress}%` }} /></div>
            <span style={{ fontSize: 12, opacity: .95 }}>
              {stats?.star_points ?? 0} XP total
            </span>
          </div>
        </div>
      </div>

      {!enoughWords && (
        <div className="notice">
          Add at least 4 words to play — the games use your own vocabulary.
        </div>
      )}

      {GAMES.map((g) => (
        <button key={g.id} className="game-card" style={{ background: g.color }}
                disabled={!enoughWords}
                onClick={() => navigate(`/games/${g.id}`)}>
          <span className="ico">{g.icon}</span>
          <span className="grow">
            <span className="t">{g.name}</span>
            <span className="d">{g.desc}</span>
          </span>
          <span className="best">best {bests[g.id] ?? 0}</span>
        </button>
      ))}

      <p className="sub" style={{ textAlign: "center", fontSize: 12.5, marginTop: 14 }}>
        Games use the words FRED gave you, so your practice is always relevant. 🦊
      </p>
    </>
  );
}
