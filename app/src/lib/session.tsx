import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { auth, getProfile, getStats } from "./api";
import type { Profile, UserStats } from "./types";

interface SessionValue {
  userId: string | null;
  profile: Profile | null;
  stats: UserStats | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionValue>({
  userId: null, profile: null, stats: null, loading: true,
  refresh: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const id = await auth.currentUserId();
    setUserId(id);
    if (!id) {
      setProfile(null);
      setStats(null);
      setLoading(false);
      return;
    }
    // A missing profile row is not fatal: the signup trigger may still be
    // catching up, so the UI degrades rather than crashing.
    const [p, s] = await Promise.all([
      getProfile().catch(() => null),
      getStats().catch(() => null),
    ]);
    setProfile(p);
    setStats(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    return auth.onChange(() => void refresh());
  }, [refresh]);

  return (
    <SessionContext.Provider value={{ userId, profile, stats, loading, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
