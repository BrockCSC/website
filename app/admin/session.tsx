"use client";

import { fetchCurrentUser, type SessionUser } from "@/lib/api";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

/** Only a net under the stream, for a proxy that drops SSE. */
const FALLBACK_POLL_MS = 5 * 60_000;

type Session = {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<Session>({
  user: null,
  loading: true,
  refresh: async () => {},
});

export const useSession = () => useContext(SessionContext);

/** One shared /api/auth/me for the whole admin area, kept current by SSE. */
export const SessionProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Null means 401; a throw is a blip and must not read as a sign-out.
  const refresh = useCallback(async () => {
    try {
      setUser(await fetchCurrentUser());
    } catch {
      // Keep whatever we last knew.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchCurrentUser()
      .then((next) => {
        if (!cancelled) setUser(next);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(onVisible, FALLBACK_POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    // Payload-free by design: the client re-reads /api/auth/me to decide.
    const stream = new EventSource("/api/auth/roles-stream");
    stream.addEventListener("roles", () => void refresh());

    return () => {
      cancelled = true;
      clearInterval(timer);
      stream.close();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh]);

  return (
    <SessionContext.Provider value={{ user, loading, refresh }}>
      {children}
    </SessionContext.Provider>
  );
};
