import { useState } from "react";
import { equipOutfit } from "../lib/api";
import { useSession } from "../lib/session";
import { OUTFITS } from "../lib/types";

export default function MascotPage() {
  const { stats, refresh } = useSession();
  const [error, setError] = useState<string | null>(null);

  const unlocked = stats?.unlocked_outfits ?? ["default"];
  const equipped = stats?.equipped_outfit ?? "default";
  const current = OUTFITS.find((o) => o.id === equipped) ?? OUTFITS[0];
  const next = OUTFITS.find((o) => !unlocked.includes(o.id));

  async function choose(id: string) {
    if (!unlocked.includes(id) || id === equipped) return;
    setError(null);
    try {
      await equipOutfit(id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <h1>Your gazelle</h1>
      <p className="sub">
        Level {stats?.mascot_level ?? 1} · {stats?.streak_current ?? 0}-day streak
      </p>

      {error && <div className="error" role="alert" style={{ marginTop: 14 }}>{error}</div>}

      <div className="card tint" style={{ marginTop: 18 }}>
        <div className="mascot">{current.icon}</div>
        <p className="sub" style={{ textAlign: "center" }}>
          {next
            ? `Keep a ${next.streak}-day streak to unlock ${next.name}.`
            : "You've unlocked every outfit. Legendary."}
        </p>
      </div>

      <p className="section-title">Outfits</p>
      <div className="outfits">
        {OUTFITS.map((o) => {
          const isUnlocked = unlocked.includes(o.id);
          return (
            <button key={o.id}
                    className={`outfit ${isUnlocked ? "" : "locked"} ${o.id === equipped ? "on" : ""}`}
                    onClick={() => void choose(o.id)}
                    disabled={!isUnlocked}
                    aria-label={isUnlocked ? `Equip ${o.name}` : `${o.name} locked`}>
              <span className="ico">{isUnlocked ? o.icon : "🔒"}</span>
              {o.name}
              <div className="tag" style={{ marginTop: 4 }}>
                {o.streak === 0 ? "start" : `${o.streak}d`}
              </div>
            </button>
          );
        })}
      </div>

      <p className="sub" style={{ marginTop: 16 }}>
        Outfits unlock from your streak automatically — the server decides, so they always
        reflect real practice.
      </p>
    </>
  );
}
