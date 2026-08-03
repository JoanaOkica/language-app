import type { VocabWord } from "../lib/types";

/**
 * A single card per word. When the same word turns up in a new activity it
 * gains another context here rather than becoming a duplicate card — so a
 * repeated routine adds nothing, but a new situation adds a fresh sentence.
 */
export default function WordCard({
  word, onDelete,
}: {
  word: VocabWord;
  onDelete?: (id: string) => void;
}) {
  const examples = word.examples ?? [];

  return (
    <article className="word-card">
      <div className="row between">
        <div className="grow">
          <span className="w">{word.word}</span>
          {word.part_of_speech && (
            <span className="sub" style={{ marginLeft: 7, fontSize: 11.5 }}>{word.part_of_speech}</span>
          )}
          <div className="t">{word.translation}</div>
        </div>
        <div className="row" style={{ gap: 7 }}>
          {examples.length > 1 && (
            <span className="pill-count">{examples.length} uses</span>
          )}
          {onDelete && (
            <button className="sm outline" aria-label={`Delete ${word.word}`}
                    onClick={() => onDelete(word.id)}>✕</button>
          )}
        </div>
      </div>

      {examples.map((ex, i) => (
        <div className="ctx" key={i}>
          <div className="label">{ex.context}</div>
          <div className="s">{ex.sentence}</div>
          {ex.translation && <div className="st">{ex.translation}</div>}
        </div>
      ))}
    </article>
  );
}
