import { useState } from "react";
import { auth, deleteAccount, updateProfile } from "../lib/api";
import { useSession } from "../lib/session";
import {
  AVATARS, LANGUAGES, LEVELS, avatarEmoji, langCode, leagueFor,
} from "../lib/types";
import type { Level } from "../lib/types";

export default function DenPage() {
  const { profile, stats, refresh } = useSession();

  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [avatar, setAvatar] = useState(profile?.avatar ?? "fox");
  const [target, setTarget] = useState(profile?.target_language ?? "Spanish");
  const [native, setNative] = useState(profile?.native_language ?? "English");
  const [level, setLevel] = useState<Level>(profile?.level ?? "beginner");
  const [isPublic, setIsPublic] = useState(profile?.is_public ?? true);

  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const xp = stats?.star_points ?? 0;
  const league = leagueFor(xp);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await updateProfile({
        display_name: displayName.trim().slice(0, 40),
        avatar,
        target_language: target,
        native_language: native,
        level,
        is_public: isPublic,
      });
      await refresh();
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reallyDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteAccount();
      await refresh();
    } catch (err) {
      setError((err as Error).message);
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Your den</h1>
        <p className="sub">@{profile?.username ?? "—"}</p>
      </div>

      {error && <div className="error" role="alert">{error}</div>}

      <section className="goal">
        <div className="row">
          <span className="avatar-btn" style={{ width: 54, height: 54, fontSize: 28, background: "rgba(255,255,255,.25)" }}>
            {avatarEmoji(avatar)}
          </span>
          <div className="grow">
            <h2>{displayName || "—"}</h2>
            <span className="badge-league">{league.current.icon} {league.current.name} league</span>
            <div className="bar" style={{ margin: "9px 0 0" }}>
              <i style={{ width: `${league.progress}%` }} />
            </div>
          </div>
        </div>
        <div className="stat-row">
          <div className="stat"><div className="n">{xp}</div><div className="l">XP</div></div>
          <div className="stat"><div className="n">{stats?.streak_current ?? 0}</div><div className="l">STREAK</div></div>
          <div className="stat"><div className="n">{stats?.streak_longest ?? 0}</div><div className="l">BEST</div></div>
        </div>
      </section>

      <div className="card" style={{ marginTop: 14 }}>
        <label htmlFor="dn">Display name</label>
        <input id="dn" value={displayName} maxLength={40}
               onChange={(e) => setDisplayName(e.target.value)} />

        <label>Avatar</label>
        <div className="avatars">
          {AVATARS.map((a) => (
            <button key={a.id} className={`av ${a.id === avatar ? "on" : ""}`}
                    onClick={() => setAvatar(a.id)} aria-label={a.id}
                    aria-pressed={a.id === avatar}>
              {a.emoji}
            </button>
          ))}
        </div>

        <label>I'm learning</label>
        <div className="chips">
          {LANGUAGES.map((l) => (
            <button key={l.name} className={`chip ${l.name === target ? "on" : ""}`}
                    onClick={() => setTarget(l.name)}>
              <span className="code">{l.code}</span>{l.name}
            </button>
          ))}
        </div>

        <label>I speak</label>
        <div className="chips">
          {LANGUAGES.map((l) => (
            <button key={l.name} className={`chip ${l.name === native ? "on-teal" : ""}`}
                    onClick={() => setNative(l.name)}>
              <span className="code">{l.code}</span>{l.name}
            </button>
          ))}
        </div>

        <label>My level</label>
        <div className="chips">
          {LEVELS.map((l) => (
            <button key={l.id} className={`chip ${l.id === level ? "on-pink" : ""}`}
                    onClick={() => setLevel(l.id)}>
              {l.label}
            </button>
          ))}
        </div>

        <label style={{ marginTop: 18 }}>Privacy</label>
        <button className={`chip ${isPublic ? "on" : ""}`} onClick={() => setIsPublic(!isPublic)}>
          {isPublic ? "✓ Visible to other users" : "Hidden from search"}
        </button>
        <p className="sub" style={{ marginTop: 8, fontSize: 12.5 }}>
          When hidden you disappear from search and leaderboards. Your XP and streak stay private.
        </p>

        <button className="full" onClick={() => void save()} disabled={busy} style={{ marginTop: 16 }}>
          {busy ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
        </button>
      </div>

      <div className="card">
        <h2>Account</h2>
        <button className="full ghost" style={{ marginTop: 12 }}
                onClick={() => void auth.signOut().then(refresh)}>
          Sign out
        </button>
      </div>

      {/* ---- Account deletion ---- */}
      <div className="card">
        <h2>Delete account</h2>
        <p className="sub" style={{ marginTop: 6 }}>
          Permanently removes your profile, words, recordings, FRED history,
          friendships and challenges. This cannot be undone.
        </p>

        {!confirming ? (
          <button className="full danger" style={{ marginTop: 14 }}
                  onClick={() => setConfirming(true)}>
            Delete my account
          </button>
        ) : (
          <>
            <label htmlFor="confirm">Type <strong>DELETE</strong> to confirm</label>
            <input id="confirm" value={confirmText} autoComplete="off"
                   onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" />
            <div className="btn-row">
              <button className="grow outline"
                      onClick={() => { setConfirming(false); setConfirmText(""); }}>
                Cancel
              </button>
              <button className="grow danger" disabled={confirmText !== "DELETE" || deleting}
                      onClick={() => void reallyDelete()}>
                {deleting ? "Deleting…" : "Delete forever"}
              </button>
            </div>
          </>
        )}
      </div>

      <p className="sub" style={{ textAlign: "center", fontSize: 12, marginTop: 4 }}>
        Learning {langCode(target)} · {LEVELS.find((l) => l.id === level)?.label}
      </p>
    </>
  );
}
