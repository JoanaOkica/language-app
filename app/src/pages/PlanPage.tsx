import { FormEvent, useEffect, useState } from "react";
import { createTask, generateVocabulary, listVocabulary } from "../lib/api";
import type { GenerateResult, VocabWord } from "../lib/types";
import WordCard from "../components/WordCard";

const SUGGESTIONS = [
  "Gym in the morning, then groceries",
  "Working from a café all day, then dinner with friends",
  "Train to the airport, check in",
];

export default function PlanPage() {
  const [text, setText] = useState("");
  const [words, setWords] = useState<VocabWord[]>([]);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    listVocabulary("recent", "today").then(setWords).catch(() => setWords([]));

  useEffect(() => { void load(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = text.trim();
    if (clean.length < 4) { setError("Tell FRED a little more about your day."); return; }

    setError(null);
    setBusy(true);
    setResult(null);
    try {
      const task = await createTask(clean.slice(0, 120));
      const res = await generateVocabulary(task.id, clean.slice(0, 120));
      setResult(res);
      await load();
      setText("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>What's your day like?</h1>
        <p className="sub">FRED packs the words you'll need</p>
      </div>

      {error && <div className="error" role="alert">{error}</div>}

      {result && <ResultBanner result={result} />}

      <form className="card" onSubmit={submit}>
        <textarea aria-label="Your day" value={text} maxLength={120}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Today I'm going to…" />
        <div className="chips" style={{ marginTop: 10 }}>
          {SUGGESTIONS.map((s) => (
            <button type="button" key={s} className="chip hint" onClick={() => setText(s)}>
              {s.length > 34 ? `${s.slice(0, 34)}…` : s}
            </button>
          ))}
        </div>
        <button className="full" type="submit" disabled={busy || text.trim().length < 4}
                style={{ marginTop: 14 }}>
          {busy ? "Packing your pockets…" : "✨ Get my words"}
        </button>
      </form>

      <div className="section-head"><h2>Your pocket words</h2></div>

      {words.length === 0 ? (
        <div className="card">
          <p className="empty">
            <span className="mascot-sm">🐱</span>
            Tell FRED your plans above and your word cards will appear here.
          </p>
        </div>
      ) : (
        words.map((w) => <WordCard key={w.id} word={w} />)
      )}
    </>
  );
}

/**
 * Explains what a repeated routine did — nothing is silently dropped, and the
 * learner can see when a familiar word simply gained a new usage.
 */
function ResultBanner({ result }: { result: GenerateResult }) {
  const parts: string[] = [];
  if (result.newWords) parts.push(`${result.newWords} new ${result.newWords === 1 ? "word" : "words"}`);
  if (result.newContexts) {
    parts.push(`${result.newContexts} new ${result.newContexts === 1 ? "sentence" : "sentences"} for words you already had`);
  }
  if (!parts.length) {
    return (
      <div className="notice">
        You've done this routine before — nothing new to add. Try describing a
        different situation to unlock new sentences.
      </div>
    );
  }
  return (
    <div className="notice">
      Added {parts.join(" and ")}.
      {result.alreadyKnown > 0 && ` ${result.alreadyKnown} already covered.`}
    </div>
  );
}
