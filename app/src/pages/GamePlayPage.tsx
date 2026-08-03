import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { awardGamePoints, listVocabulary } from "../lib/api";
import { useSession } from "../lib/session";
import { GAMES, GameId, speechTag } from "../lib/types";
import type { VocabWord } from "../lib/types";

const ROUNDS = 5;
const POINTS_PER_CORRECT = 4;

const shuffle = <T,>(a: T[]): T[] => [...a].sort(() => Math.random() - 0.5);

export default function GamePlayPage() {
  const { gameId } = useParams<{ gameId: GameId }>();
  const navigate = useNavigate();
  const { profile, refresh } = useSession();
  // Read the word aloud in the language being learned, not a hardcoded one.
  const speechLang = speechTag(profile?.target_language);

  const game = GAMES.find((g) => g.id === gameId);
  const [words, setWords] = useState<VocabWord[] | null>(null);
  const [round, setRound] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void listVocabulary("recent").then(setWords).catch(() => setWords([]));
  }, []);

  const finish = useCallback(async (finalCorrect: number) => {
    setDone(true);
    const points = finalCorrect * POINTS_PER_CORRECT;
    if (points > 0) {
      setSaving(true);
      try {
        await awardGamePoints(points, gameId!);
        await refresh();
      } catch { /* score simply isn't recorded */ }
      setSaving(false);
    }
  }, [gameId, refresh]);

  const next = useCallback((wasRight: boolean) => {
    const nextCorrect = correct + (wasRight ? 1 : 0);
    setCorrect(nextCorrect);
    if (round + 1 >= ROUNDS) void finish(nextCorrect);
    else setRound(round + 1);
  }, [correct, round, finish]);

  if (!game) return <p className="spinner">Unknown game.</p>;
  if (!words) return <p className="spinner">Loading your words…</p>;
  if (words.length < 4) {
    return (
      <div className="card">
        <p className="empty">You need at least 4 words to play.</p>
        <button className="full" onClick={() => navigate("/plan")}>Plan my day</button>
      </div>
    );
  }

  return (
    <>
      <div className="game-top" style={{ marginBottom: 4 }}>
        <div>
          <h1>{game.icon} {game.name}</h1>
          <p className="sub">{game.desc}</p>
        </div>
        <button className="sm outline" onClick={() => navigate("/games")}>Quit</button>
      </div>

      <div className="progress">
        <i style={{ width: `${((done ? ROUNDS : round) / ROUNDS) * 100}%` }} />
      </div>

      {done ? (
        <div className="card">
          <div className="result-big">
            <div className="n">{correct}/{ROUNDS}</div>
            <p className="sub">
              {saving ? "Saving…" : `+${correct * POINTS_PER_CORRECT} XP earned`}
            </p>
          </div>
          <button className="full" onClick={() => { setRound(0); setCorrect(0); setDone(false); }}>
            Play again
          </button>
          <button className="full ghost" style={{ marginTop: 9 }} onClick={() => navigate("/games")}>
            Back to games
          </button>
        </div>
      ) : game.id === "match" ? (
        <MatchRound key={round} words={words} onDone={next} />
      ) : game.id === "builder" ? (
        <BuilderRound key={round} words={words} onDone={next} />
      ) : (
        <ChoiceRound key={round} words={words} listen={game.id === "echo"}
                     speechLang={speechLang} onDone={next} />
      )}
    </>
  );
}

/* ---------------- Quick Quiz & Echo Cat: pick the translation ---------------- */

function ChoiceRound({
  words, listen, speechLang, onDone,
}: {
  words: VocabWord[];
  listen: boolean;
  speechLang: string;
  onDone: (right: boolean) => void;
}) {
  const { target, options } = useMemo(() => {
    const pool = shuffle(words);
    const answer = pool[0];
    const distractors = pool.slice(1, 4);
    return { target: answer, options: shuffle([answer, ...distractors]) };
  }, [words]);

  const [picked, setPicked] = useState<string | null>(null);

  const speak = useCallback(() => {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(target.word);
    u.lang = speechLang;
    window.speechSynthesis.speak(u);
  }, [target.word, speechLang]);

  useEffect(() => { if (listen) speak(); }, [listen, speak]);

  function choose(id: string) {
    if (picked) return;
    setPicked(id);
    window.setTimeout(() => onDone(id === target.id), 850);
  }

  return (
    <>
      <div className="prompt-card">
        <div className="kicker">{listen ? "What did you hear?" : "What does this mean?"}</div>
        {listen ? (
          <button className="ghost" style={{ marginTop: 12 }} onClick={speak}>🔊 Play again</button>
        ) : (
          <div className="q">{target.word}</div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        {options.map((o) => {
          const cls = picked
            ? o.id === target.id ? "opt right" : o.id === picked ? "opt wrong" : "opt"
            : "opt";
          return (
            <button key={o.id} className={cls} onClick={() => choose(o.id)}>
              {listen ? o.word : o.translation}
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ---------------- Word Match: pair words with meanings ---------------- */

function MatchRound({
  words, onDone,
}: {
  words: VocabWord[];
  onDone: (right: boolean) => void;
}) {
  const pairs = useMemo(() => shuffle(words).slice(0, 4), [words]);
  const left = useMemo(() => shuffle(pairs), [pairs]);
  const right = useMemo(() => shuffle(pairs), [pairs]);

  const [selected, setSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [misses, setMisses] = useState(0);

  useEffect(() => {
    if (matched.length === pairs.length) {
      const t = window.setTimeout(() => onDone(misses === 0), 500);
      return () => window.clearTimeout(t);
    }
  }, [matched, pairs.length, misses, onDone]);

  function tapWord(id: string) {
    if (matched.includes(id)) return;
    setSelected(id);
  }

  function tapMeaning(id: string) {
    if (matched.includes(id) || !selected) return;
    if (selected === id) setMatched((m) => [...m, id]);
    else setMisses((n) => n + 1);
    setSelected(null);
  }

  return (
    <>
      <div className="prompt-card">
        <div className="kicker">Match the pairs</div>
        <div className="q" style={{ fontSize: 14 }}>
          {matched.length} / {pairs.length} matched
        </div>
      </div>

      <div className="match-grid" style={{ marginTop: 16 }}>
        <div>
          {left.map((w) => (
            <button key={w.id} style={{ width: "100%", marginBottom: 9 }}
                    className={`match ${matched.includes(w.id) ? "done" : selected === w.id ? "sel" : ""}`}
                    onClick={() => tapWord(w.id)}>
              {w.word}
            </button>
          ))}
        </div>
        <div>
          {right.map((w) => (
            <button key={w.id} style={{ width: "100%", marginBottom: 9 }}
                    className={`match ${matched.includes(w.id) ? "done" : ""}`}
                    onClick={() => tapMeaning(w.id)}>
              {w.translation}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/* ---------------- Sentence Builder: tap words into order ---------------- */

function BuilderRound({
  words, onDone,
}: {
  words: VocabWord[];
  onDone: (right: boolean) => void;
}) {
  // Only words that actually carry an example sentence can be built.
  const candidates = words.filter((w) => (w.examples?.length ?? 0) > 0);
  const target = useMemo(
    () => (candidates.length ? shuffle(candidates)[0] : null),
    [candidates],
  );

  const sentence = target?.examples[0]?.sentence ?? "";
  const tokens = useMemo(
    () => sentence.replace(/[.?!]$/, "").split(/\s+/).filter(Boolean),
    [sentence],
  );
  const [pool, setPool] = useState<string[]>(() => shuffle(tokens));
  const [built, setBuilt] = useState<string[]>([]);
  const [verdict, setVerdict] = useState<"right" | "wrong" | null>(null);

  useEffect(() => { setPool(shuffle(tokens)); setBuilt([]); }, [tokens]);

  if (!target || tokens.length < 2) {
    return (
      <div className="card">
        <p className="empty">Not enough example sentences yet — plan a day to get some.</p>
        <button className="full" onClick={() => onDone(false)}>Skip</button>
      </div>
    );
  }

  function check() {
    const ok = built.join(" ").toLowerCase() === tokens.join(" ").toLowerCase();
    setVerdict(ok ? "right" : "wrong");
    window.setTimeout(() => onDone(ok), 900);
  }

  return (
    <>
      <div className="prompt-card">
        <div className="kicker">Build the sentence</div>
        <div className="q" style={{ fontSize: 15 }}>
          “{target.translation}” — use the word <strong>{target.word}</strong>
        </div>
        <div className="answer-slot"
             style={verdict === "right" ? { borderColor: "var(--green)" }
                  : verdict === "wrong" ? { borderColor: "#d94436" } : undefined}>
          {built.length === 0
            ? <span className="sub">Tap the words below</span>
            : built.map((t, i) => (
                <button key={`${t}-${i}`} className="chip"
                        onClick={() => { setBuilt(built.filter((_, j) => j !== i)); setPool([...pool, t]); }}>
                  {t}
                </button>
              ))}
        </div>
      </div>

      <div className="chips" style={{ marginTop: 16 }}>
        {pool.map((t, i) => (
          <button key={`${t}-${i}`} className="chip"
                  onClick={() => { setPool(pool.filter((_, j) => j !== i)); setBuilt([...built, t]); }}>
            {t}
          </button>
        ))}
      </div>

      <button className="full" style={{ marginTop: 18 }}
              disabled={built.length !== tokens.length || verdict !== null} onClick={check}>
        Check
      </button>
      <button className="full ghost" style={{ marginTop: 9 }}
              disabled={verdict !== null}
              onClick={() => { setPool(shuffle(tokens)); setBuilt([]); }}>
        Clear
      </button>
    </>
  );
}
