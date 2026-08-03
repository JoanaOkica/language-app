import { FormEvent, useState } from "react";
import { updateProfile } from "../lib/api";
import { useSession } from "../lib/session";
import { AVATARS, LANGUAGES, LEVELS } from "../lib/types";
import type { Level } from "../lib/types";

export default function OnboardingPage() {
  const { profile, refresh } = useSession();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [username, setUsername] = useState(profile?.username ?? "");
  const [avatar, setAvatar] = useState("cat");
  const [native, setNative] = useState(profile?.native_language ?? "English");
  const [target, setTarget] = useState(profile?.target_language ?? "Spanish");
  const [level, setLevel] = useState<Level>("beginner");
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
    if (native === target) {
      setError("Pick a different language to learn.");
      return;
    }
    setBusy(true);
    try {
      await updateProfile({
        display_name: displayName.trim().slice(0, 40),
        username: handle,
        avatar,
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
    <div className="shell">
      <form className="content" onSubmit={submit}>
        <div style={{ textAlign: "center", padding: "18px 0 8px" }}>
          <div style={{ fontSize: 44 }} aria-hidden="true">🐱</div>
          <h1>Set up your den</h1>
          <p className="sub">This tunes your words and FRED's coaching.</p>
        </div>

        {error && <div className="error" role="alert">{error}</div>}

        <div className="card">
          <label htmlFor="dn">Display name</label>
          <input id="dn" required maxLength={40} value={displayName}
                 onChange={(e) => setDisplayName(e.target.value)} placeholder="Joana" />

          <label htmlFor="un">Username</label>
          <input id="un" required maxLength={20} value={username}
                 onChange={(e) => setUsername(e.target.value)} placeholder="joana" />

          <label>Pick your avatar</label>
          <div className="avatars">
            {AVATARS.map((a) => (
              <button type="button" key={a.id} aria-label={a.id} aria-pressed={a.id === avatar}
                      className={`av ${a.id === avatar ? "on" : ""}`}
                      onClick={() => setAvatar(a.id)}>
                {a.emoji}
              </button>
            ))}
          </div>

          <label>I'm learning</label>
          <div className="chips">
            {LANGUAGES.map((l) => (
              <button type="button" key={l.name} className={`chip ${l.name === target ? "on" : ""}`}
                      onClick={() => setTarget(l.name)}>
                <span className="code">{l.code}</span>{l.name}
              </button>
            ))}
          </div>

          <label>I speak</label>
          <div className="chips">
            {LANGUAGES.map((l) => (
              <button type="button" key={l.name} className={`chip ${l.name === native ? "on-teal" : ""}`}
                      onClick={() => setNative(l.name)}>
                <span className="code">{l.code}</span>{l.name}
              </button>
            ))}
          </div>

          <label>My level</label>
          <div className="chips">
            {LEVELS.map((l) => (
              <button type="button" key={l.id} className={`chip ${l.id === level ? "on-pink" : ""}`}
                      onClick={() => setLevel(l.id)}>
                {l.label}
              </button>
            ))}
          </div>

          <button className="full" type="submit" disabled={busy} style={{ marginTop: 18 }}>
            {busy ? "Setting up…" : "Start learning"}
          </button>
        </div>
      </form>
    </div>
  );
}
