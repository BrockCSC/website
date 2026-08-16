import { recentRoleEvents } from "./keycloak-admin";
import { invalidateRoles } from "./session";

/**
 * No webhook extension is installed, so one watcher reads Keycloak's admin
 * event log for everyone connected. Replacing `poll` with a webhook leaves
 * subscribers untouched.
 */
const POLL_MS = 5_000;

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();
let timer: ReturnType<typeof setInterval> | null = null;
/** Keycloak's clock, not ours. */
let watermark = 0;

const publish = (userId: string) => {
  invalidateRoles(userId);
  for (const notify of listeners.get(userId) ?? []) notify();
};

const poll = async () => {
  try {
    const events = await recentRoleEvents(watermark);
    const newest = Math.max(watermark, ...events.map((event) => event.time));

    // First tick sets the watermark rather than replaying the log.
    if (watermark === 0) {
      watermark = newest || Date.now();
      return;
    }
    watermark = newest;
    for (const { userId } of events) publish(userId);
  } catch {
    // Best-effort: the next tick retries.
  }
};

/** Returns the unsubscribe. The watcher runs only while someone listens. */
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
