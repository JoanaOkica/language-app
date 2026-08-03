import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteWord, listVocabulary, VocabRange, VocabSort } from "../lib/api";
import type { VocabWord } from "../lib/types";
import WordCard from "../components/WordCard";

export default function WordsPage() {
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

  const totalUses = visible.reduce((n, w) => n + (w.examples?.length ?? 0), 0);

  return (
    <>
      <div className="page-head">
        <h1>Your words</h1>
        <p className="sub">
          {visible.length} {visible.length === 1 ? "card" : "cards"} · {totalUses} sentences
        </p>
      </div>

      <div className="card">
        <input aria-label="Search words" placeholder="Search…" value={query}
               onChange={(e) => setQuery(e.target.value)} />
        <div className="row" style={{ marginTop: 10, gap: 8 }}>
          <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as VocabSort)}>
            <option value="alpha">A–Z</option>
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
            <span className="fox">🦊</span>
            No words here yet.
          </p>
          <button className="full" onClick={() => navigate("/plan")}>Plan my day</button>
        </div>
      ) : (
        visible.map((w) => <WordCard key={w.id} word={w} onDelete={remove} />)
      )}
    </>
  );
}
