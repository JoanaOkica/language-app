import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { auth, ensureProfile, getProfile, getStats } from "./api";
import type { Profile, UserStats } from "./types";

interface SessionValue {
  userId: string | null;
  profile: Profile | null;
  stats: UserStats | null;
  loading: boolean;
  /** Set when a session exists but the address was never verified. */
  unconfirmed: boolean;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionValue>({
  userId: null, profile: null, stats: null, loading: true, unconfirmed: false,
  refresh: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [unconfirmed, setUnconfirmed] = useState(false);

  const refresh = useCallback(async () => {
    const id = await auth.currentUserId();
    setUserId(id);
    if (!id) {
      setProfile(null);
      setStats(null);
      setUnconfirmed(false);
      setLoading(false);
      return;
    }

    // Provisioning happens on first use rather than via an auth.users trigger,
    // which would fire for every app sharing this Supabase project. The call
    // also refuses unverified addresses, so confirmation is enforced by the
    // database and not only by the Auth settings.
    try {
      await ensureProfile();
      setUnconfirmed(false);
    } catch (err) {
      if ((err as Error).message === "email_not_confirmed") {
        setUnconfirmed(true);
        await auth.signOut();
        setUserId(null);
        setProfile(null);
        setStats(null);
        setLoading(false);
        return;
      }
      // Any other failure degrades to a read-only view rather than crashing.
    }

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
    <SessionContext.Provider value={{ userId, profile, stats, loading, unconfirmed, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
