import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteWord, listVocabulary, VocabRange, VocabSort } from "../lib/api";
import type { VocabWord } from "../lib/types";

export default function LibraryPage() {
  const navigate = useNavigate();
  const [words, setWords] = useState<VocabWord[]>([]);
  const [sort, setSort] = useState<VocabSort>("alpha");
  const [range, setRange] = useState<VocabRange>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setWords(await listVocabulary(sort, range));
    } finally {
      setLoading(false);
    }
  }, [sort, range]);

  useEffect(() => { void load(); }, [load]);

  async function remove(id: string) {
    setWords((w) => w.filter((x) => x.id !== id));   // optimistic
    try { await deleteWord(id); } catch { void load(); }
  }

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? words.filter((w) =>
        w.word.toLowerCase().includes(needle) || w.translation.toLowerCase().includes(needle))
    : words;

  return (
    <>
      <h1>Vocabulary library</h1>
      <p className="sub">{visible.length} {visible.length === 1 ? "word" : "words"}</p>

      <div className="card" style={{ marginTop: 16 }}>
        <input aria-label="Search words" placeholder="Search…" value={query}
               onChange={(e) => setQuery(e.target.value)} />
        <div className="row" style={{ marginTop: 10, gap: 8 }}>
          <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as VocabSort)}>
            <option value="alpha">A–Z (default)</option>
            <option value="recent">Newest first</option>
          </select>
          <select aria-label="Filter by date" value={range} onChange={(e) => setRange(e.target.value as VocabRange)}>
            <option value="all">All time</option>
            <option value="today">Added today</option>
            <option value="week">Past 7 days</option>
          </select>
        </div>
      </div>

      {loading ? (
        <p className="spinner">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="card">
          <p className="empty">
            Nothing here yet.<br />Generate a list from a daily activity to get started.
          </p>
          <button className="full subtle" onClick={() => navigate("/tasks")}>➕ New vocabulary task</button>
        </div>
      ) : (
        <div className="card">
          {visible.map((w) => (
            <div className="list-item" key={w.id}>
              <div className="row between">
                <span className="word">{w.word}</span>
                <div className="row" style={{ gap: 8 }}>
                  <span className="trans">{w.translation}</span>
                  <button className="sm ghost" aria-label={`Delete ${w.word}`}
                          onClick={() => void remove(w.id)}>✕</button>
                </div>
              </div>
              {w.example_sentence && <div className="example">{w.example_sentence}</div>}
              {w.sentence_translation && <div className="trans">{w.sentence_translation}</div>}
              {w.task_context && <span className="tag">{w.task_context}</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
