"use client";

import { fetchCurrentUser, type SessionUser } from "@/lib/api";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

/** The stream is what makes this feel instant; this is only the net under it,
 * for a proxy that drops SSE or a watcher that cannot reach Keycloak. */
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

/**
 * One poll of /api/auth/me for the whole admin area. Roles are re-read on a
 * timer and whenever the tab comes back, so a grant or revocation in Keycloak
 * reaches the tabs without a reload. That request also refreshes the server's
 * role cache, which keeps what the UI offers and what the API allows in step.
 */
export const SessionProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  // fetchCurrentUser answers null for 401 and throws for anything else. Only
  // the former is a sign-out; polling every 15s makes a blip likely enough
  // that treating one as a sign-out would eventually log someone out for it.
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

    // A background tab polling Keycloak every 15s is all cost and no benefit.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(onVisible, FALLBACK_POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    // Server-sent events carry no payload — they only say "ask again" — so a
    // stale or spoofed message can never widen what this browser thinks it may
    // do. EventSource reconnects on its own if the stream drops.
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
