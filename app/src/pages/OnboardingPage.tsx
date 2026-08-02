import { FormEvent, useState } from "react";
import { updateProfile } from "../lib/api";
import { useSession } from "../lib/session";
import type { FluencyLevel } from "../lib/types";

const LANGUAGES = ["Spanish", "French", "German", "Italian", "Portuguese", "Japanese"];
const NATIVE = ["English", "Portuguese", "French", "Spanish", "German"];
const LEVELS: Array<{ id: FluencyLevel; label: string }> = [
  { id: "A1", label: "A1 — Just starting" },
  { id: "A2", label: "A2 — Elementary" },
  { id: "B1", label: "B1 — Intermediate" },
  { id: "B2", label: "B2 — Upper intermediate" },
  { id: "C1", label: "C1 — Advanced" },
];

export default function OnboardingPage() {
  const { profile, refresh } = useSession();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [username, setUsername] = useState(profile?.username ?? "");
  const [native, setNative] = useState(profile?.native_language ?? "English");
  const [target, setTarget] = useState(profile?.target_language ?? "Spanish");
  const [level, setLevel] = useState<FluencyLevel>(profile?.level ?? "A2");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const handle = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(handle)) {
      setError("Username must be 3–20 characters: letters, numbers or underscore.");
      return;
    }
    setBusy(true);
    try {
      await updateProfile({
        display_name: displayName.trim().slice(0, 40),
        username: handle,
        native_language: native,
        target_language: target,
        level,
        onboarded: true,
      });
      await refresh();
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg.includes("duplicate") ? "That username is taken." : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <form className="auth-box card" onSubmit={submit}>
        <h1>Set up your profile</h1>
        <p className="sub">This tunes the vocabulary and FRED's coaching to your level.</p>
        {error && <div className="error" role="alert" style={{ marginTop: 14 }}>{error}</div>}

        <label htmlFor="dn">Display name</label>
        <input id="dn" required maxLength={40} value={displayName}
               onChange={(e) => setDisplayName(e.target.value)} placeholder="Joana" />

        <label htmlFor="un">Username (how friends find you)</label>
        <input id="un" required maxLength={20} value={username}
               onChange={(e) => setUsername(e.target.value)} placeholder="joana" />

        <label htmlFor="nl">I speak</label>
        <select id="nl" value={native} onChange={(e) => setNative(e.target.value)}>
          {NATIVE.map((l) => <option key={l}>{l}</option>)}
        </select>

        <label htmlFor="tl">I'm learning</label>
        <select id="tl" value={target} onChange={(e) => setTarget(e.target.value)}>
          {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
        </select>

        <label htmlFor="lv">My level</label>
        <select id="lv" value={level} onChange={(e) => setLevel(e.target.value as FluencyLevel)}>
          {LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>

        <div className="btn-row">
          <button className="full" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Start learning"}
          </button>
        </div>
      </form>
    </div>
  );
}
