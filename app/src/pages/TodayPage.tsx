import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listVocabulary } from "../lib/api";
import { useSession } from "../lib/session";
import { DAILY_GOAL_XP, langCode, leagueFor, levelLabel } from "../lib/types";
import type { VocabWord } from "../lib/types";
import WordCard from "../components/WordCard";

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

export default function TodayPage() {
  const { profile, stats } = useSession();
  const navigate = useNavigate();
  const [todayWords, setTodayWords] = useState<VocabWord[]>([]);

  useEffect(() => {
    void listVocabulary("recent", "today").then(setTodayWords).catch(() => setTodayWords([]));
  }, []);

  const xp = stats?.star_points ?? 0;
  const streak = stats?.streak_current ?? 0;
  const league = leagueFor(xp);

  // Today's XP is what the daily-goal ring tracks; the streak fills the week.
  const todayXp = Math.min(DAILY_GOAL_XP, todayWords.length * 5 + (streak > 0 ? 10 : 0));
  const goalPct = Math.round((todayXp / DAILY_GOAL_XP) * 100);
  const todayIdx = (new Date().getDay() + 6) % 7;   // Monday-first

  return (
    <>
      <div style={{ padding: "6px 0 16px" }}>
        <h1>
          Hei, {profile?.display_name || "there"}!{" "}
          <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>
            {langCode(profile?.target_language ?? "")}
          </span>
        </h1>
        <p className="sub">
          Learning {profile?.target_language} · {levelLabel(profile?.level ?? "beginner")}
        </p>
      </div>

      <section className="goal">
        <div className="row between" style={{ alignItems: "flex-start" }}>
          <div>
            <div className="label">DAILY GOAL</div>
            <div className="xp">{todayXp} / {DAILY_GOAL_XP} XP</div>
          </div>
          <div>
            <div className="streak-n">{streak} 🔥</div>
            <div className="streak-l">day streak</div>
          </div>
        </div>
        <div className="bar"><i style={{ width: `${goalPct}%` }} /></div>
        <div className="week">
          {DAY_LETTERS.map((d, i) => (
            <div key={i}>
              {d}
              <div className={`dot ${i < todayIdx && streak > todayIdx - i - 1 ? "done" : ""}`}>
                {i < todayIdx && streak > todayIdx - i - 1 ? "✓" : ""}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="tiles">
        <button className="tile yellow" onClick={() => navigate("/plan")}>
          <span className="ico">📝</span>
          <span className="t">Plan today</span>
          <span className="d">Get your words</span>
        </button>
        <button className="tile teal" onClick={() => navigate("/talk")}>
          <span className="ico">💬</span>
          <span className="t">Practise</span>
          <span className="d">Chat with FRED</span>
        </button>
        <button className="tile pink" onClick={() => navigate("/games")}>
          <span className="ico">🎮</span>
          <span className="t">Play</span>
          <span className="d">4 mini games</span>
        </button>
        <button className="tile green" onClick={() => navigate("/challenges")}>
          <span className="ico">🏆</span>
          <span className="t">Challenges</span>
          <span className="d">Beat your friends</span>
        </button>
      </div>

      <div className="section-head">
        <h2>Today's words</h2>
        <button className="link-more" onClick={() => navigate("/words")}>See all</button>
      </div>

      {todayWords.length === 0 ? (
        <div className="card">
          <p className="empty" style={{ padding: "10px 4px 16px" }}>
            No words yet today. Tell FRED what you're up to and he'll pack your pockets.
          </p>
          <button className="full" onClick={() => navigate("/plan")}>Plan my day</button>
        </div>
      ) : (
        todayWords.slice(0, 4).map((w) => <WordCard key={w.id} word={w} />)
      )}

      <div className="card" style={{ marginTop: 14 }}>
        <div className="league">
          <span className="egg">{league.current.icon}</span>
          <div className="grow">
            <h3>{league.current.name} league</h3>
            <div className="bar-sm"><i style={{ width: `${league.progress}%` }} /></div>
            <span className="sub" style={{ fontSize: 12 }}>
              {league.next ? `${league.toNext} XP to ${league.next.name}` : "Top league reached"}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
