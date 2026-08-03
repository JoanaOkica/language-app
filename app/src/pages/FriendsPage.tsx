import { FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  listFriends, listRequests, respondToRequest, searchProfiles, sendFriendRequest,
} from "../lib/api";
import { avatarEmoji } from "../lib/types";
import type { FriendRequest, PublicProfile } from "../lib/types";

export default function FriendsPage() {
  const navigate = useNavigate();
  const [friends, setFriends] = useState<PublicProfile[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicProfile[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [f, r] = await Promise.all([
      listFriends().catch(() => []),
      listRequests().catch(() => []),
    ]);
    setFriends(f);
    setRequests(r);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function search(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (query.trim().length < 2) { setError("Type at least 2 characters."); return; }
    setSearching(true);
    try {
      setResults(await searchProfiles(query));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function add(id: string, name: string) {
    setError(null);
    try {
      await sendFriendRequest(id);
      setNotice(`Friend request sent to ${name}.`);
      setResults(null);
      setQuery("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function respond(connectionId: string, accept: boolean) {
    setRequests((r) => r.filter((x) => x.connection_id !== connectionId));
    try {
      await respondToRequest(connectionId, accept);
      await load();
    } catch (err) {
      setError((err as Error).message);
      await load();
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Friends</h1>
        <p className="sub">Compare streaks, then challenge them to a speaking sprint.</p>
      </div>

      {error && <div className="error" role="alert" style={{ marginTop: 14 }}>{error}</div>}

      <form className="card" onSubmit={search} style={{ marginTop: 16 }}>
        <label htmlFor="q">Find people by username</label>
        <div className="row" style={{ gap: 8 }}>
          <input id="q" className="grow" value={query} maxLength={20}
                 onChange={(e) => setQuery(e.target.value)} placeholder="username" />
          <button type="submit" disabled={searching}>{searching ? "…" : "Search"}</button>
        </div>
        {notice && <p className="sub" style={{ marginTop: 10 }}>{notice}</p>}

        {results && (
          results.length === 0
            ? <p className="empty">No one found with that username.</p>
            : results.map((p) => (
                <div className="friend" key={p.id}>
                  <span className="face">{avatarEmoji(p.avatar)}</span>
                  <div className="grow">
                    <div style={{ fontWeight: 800 }}>{p.display_name}</div>
                    <span className="sub">@{p.username} · 🔥 {p.streak_current}</span>
                  </div>
                  <button className="sm" onClick={() => void add(p.id, p.display_name)}>Add</button>
                </div>
              ))
        )}
      </form>

      {requests.length > 0 && (
        <>
          <p className="section-title">Requests ({requests.length})</p>
          <div className="card">
            {requests.map((r) => (
              <div className="friend" key={r.connection_id}>
                <span className="face">{avatarEmoji(r.avatar)}</span>
                <div className="grow">
                  <div style={{ fontWeight: 800 }}>{r.display_name}</div>
                  <span className="sub">@{r.username} · ⭐ {r.star_points}</span>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="sm" onClick={() => void respond(r.connection_id, true)}>Accept</button>
                  <button className="sm outline" onClick={() => void respond(r.connection_id, false)}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="section-title">Your friends ({friends.length})</p>
      <div className="card">
        {friends.length === 0 ? (
          <p className="empty">No friends yet — search for a username above.</p>
        ) : friends.map((f) => (
          <div className="friend" key={f.id}>
            <span className="face">{avatarEmoji(f.avatar)}</span>
            <div className="grow">
              <div style={{ fontWeight: 800 }}>{f.display_name}</div>
              <span className="sub">🔥 {f.streak_current} · ⭐ {f.star_points}</span>
            </div>
            <button className="sm ghost" onClick={() => navigate("/challenges")}>Challenge</button>
          </div>
        ))}
      </div>
    </>
  );
}
