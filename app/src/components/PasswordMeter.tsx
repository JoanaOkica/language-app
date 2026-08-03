import type { PasswordVerdict } from "../lib/password";

const COLOURS: Record<string, string> = {
  weak: "#d94436",
  fair: "#e8a33d",
  good: "#4cb782",
  strong: "#2f8f5b",
};

const LABELS: Record<string, string> = {
  weak: "Weak",
  fair: "Getting there",
  good: "Good",
  strong: "Strong",
};

/**
 * Live feedback while choosing a password. Shows the single most useful thing
 * to fix rather than a wall of rules — people act on one instruction, not five.
 */
export default function PasswordMeter({ verdict }: { verdict: PasswordVerdict }) {
  if (verdict.score === 0 && !verdict.problem) return null;

  const colour = COLOURS[verdict.strength];

  return (
    <div style={{ marginTop: 10 }} aria-live="polite">
      <div className="meter" style={{ height: 6 }}>
        <i style={{ width: `${verdict.score}%`, background: colour }} />
      </div>
      <div className="row between" style={{ marginTop: 6, gap: 10, alignItems: "flex-start" }}>
        <span className="sub" style={{ fontSize: 12, color: colour, fontWeight: 800 }}>
          {LABELS[verdict.strength]}
        </span>
        {verdict.problem && (
          <span className="sub" style={{ fontSize: 12, textAlign: "right", flex: 1 }}>
            {verdict.problem}
          </span>
        )}
      </div>
    </div>
  );
}
