import { recentRoleEvents } from "./keycloak-admin";
import { invalidateRoles } from "./session";

/**
 * Keycloak will not call us — no webhook extension is installed — so one
 * watcher reads its admin-event log on behalf of everyone connected. That is a
 * single request per tick however many admins have the page open, in place of
 * every browser asking about itself, and it only runs while someone is
 * listening. Swapping in a webhook later means replacing `poll` and nothing
 * else: subscribers already work off `publish`.
 */
const POLL_MS = 5_000;

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();
let timer: ReturnType<typeof setInterval> | null = null;
/** Keycloak's clock, not ours: the app container's may differ by seconds. */
let watermark = 0;

const publish = (userId: string) => {
  invalidateRoles(userId);
  for (const notify of listeners.get(userId) ?? []) notify();
};

const poll = async () => {
  try {
    const events = await recentRoleEvents(watermark);
    const newest = Math.max(watermark, ...events.map((event) => event.time));

    // The first tick only learns where "now" is on Keycloak's clock. Without
    // it a restart would replay every role change in the log as if it were new.
    if (watermark === 0) {
      watermark = newest || Date.now();
      return;
    }
    watermark = newest;
    for (const { userId } of events) publish(userId);
  } catch {
    // Reading events is best-effort: the next tick tries again, and the client
    // keeps its own slow refresh for the case where this never recovers.
  }
};

/** Returns the unsubscribe. The watcher starts with the first listener and
 * stops with the last, so an empty admin area costs nothing. */
export const subscribeToRoleChanges = (userId: string, listener: Listener) => {
  const forUser = listeners.get(userId) ?? new Set<Listener>();
  forUser.add(listener);
  listeners.set(userId, forUser);

  timer ??= setInterval(() => void poll(), POLL_MS);

  return () => {
    forUser.delete(listener);
    if (forUser.size === 0) listeners.delete(userId);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
      watermark = 0;
    }
  };
};
