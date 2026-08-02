import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createTask, generateVocabulary, listTasks } from "../lib/api";
import type { Task, VocabWord } from "../lib/types";

const SUGGESTIONS = [
  "Ordering a sandwich",
  "Checking into a hotel",
  "Asking for directions",
  "A job interview",
];

export default function TasksPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("Ordering a sandwich");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [generated, setGenerated] = useState<VocabWord[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void listTasks().then(setTasks).catch(() => setTasks([])); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = title.trim();
    if (clean.length < 3) { setError("Describe the activity in a few words."); return; }

    setError(null);
    setBusy(true);
    setGenerated(null);
    try {
      const task = await createTask(clean);
      const words = await generateVocabulary(task.id, clean);
      setGenerated(words);
      setTasks(await listTasks());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>New vocabulary task</h1>
      <p className="sub">Words and sentences are generated for your level, on the server.</p>

      <form className="card" onSubmit={submit} style={{ marginTop: 18 }}>
        {error && <div className="error" role="alert">{error}</div>}
        <label htmlFor="activity">What do you want to practise?</label>
        <input id="activity" value={title} maxLength={120}
               onChange={(e) => setTitle(e.target.value)}
               placeholder="e.g. Ordering a sandwich" />
        <div className="chips">
          {SUGGESTIONS.map((s) => (
            <button type="button" key={s} className="sm ghost" onClick={() => setTitle(s)}>{s}</button>
          ))}
        </div>
        <div className="btn-row">
          <button className="full" type="submit" disabled={busy}>
            {busy ? "Generating…" : "✨ Generate word list"}
          </button>
        </div>
        {busy && <p className="spinner">Asking the language model…</p>}
      </form>

      {generated && (
        <div className="card">
          <h2>Added {generated.length} words</h2>
          {generated.map((w) => (
            <div className="list-item" key={w.id}>
              <div className="row between">
                <span className="word">{w.word}</span>
                <span className="trans">{w.translation}</span>
              </div>
              {w.example_sentence && <div className="example">{w.example_sentence}</div>}
              {w.sentence_translation && <div className="trans">{w.sentence_translation}</div>}
            </div>
          ))}
          <div className="btn-row">
            <button className="full subtle" onClick={() => navigate("/library")}>View in library</button>
          </div>
        </div>
      )}

      {tasks.length > 0 && (
        <>
          <p className="section-title">Recent tasks</p>
          <div className="card">
            {tasks.slice(0, 8).map((t) => (
              <div className="list-item row between" key={t.id}>
                <span className="grow">{t.title}</span>
                <span className="tag" style={{ marginTop: 0 }}>{t.status}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
