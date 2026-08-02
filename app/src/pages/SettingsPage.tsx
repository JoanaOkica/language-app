import { useState } from "react";
import { auth, updateProfile } from "../lib/api";
import { useSession } from "../lib/session";
import type { FluencyLevel } from "../lib/types";

const LEVELS: FluencyLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

export default function SettingsPage() {
  const { profile, refresh } = useSession();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [level, setLevel] = useState<FluencyLevel>(profile?.level ?? "A1");
  const [isPublic, setIsPublic] = useState(profile?.is_public ?? true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await updateProfile({
        display_name: displayName.trim().slice(0, 40),
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

  return (
    <>
      <h1>Settings</h1>
      <p className="sub">@{profile?.username ?? "—"}</p>

      {error && <div className="error" role="alert" style={{ marginTop: 14 }}>{error}</div>}

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Profile</h2>

        <label htmlFor="dn">Display name</label>
        <input id="dn" value={displayName} maxLength={40}
               onChange={(e) => setDisplayName(e.target.value)} />

        <label htmlFor="lv">Level</label>
        <select id="lv" value={level} onChange={(e) => setLevel(e.target.value as FluencyLevel)}>
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>

        <label style={{ marginTop: 16 }}>
          <span className="row" style={{ gap: 8 }}>
            <input type="checkbox" style={{ width: "auto" }} checked={isPublic}
                   onChange={(e) => setIsPublic(e.target.checked)} />
            <span>Show my profile to other users</span>
          </span>
        </label>
        <p className="sub">
          When off, you disappear from search and leaderboards. Your streak and points stay private.
        </p>

        <div className="btn-row">
          <button className="full" onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Account</h2>
        <p className="sub">
          Signing out clears your session on this device.
        </p>
        <div className="btn-row">
          <button className="full ghost" onClick={() => void auth.signOut().then(refresh)}>
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}
