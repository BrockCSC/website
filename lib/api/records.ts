import { apiFetch } from "./client";
import type { DashboardStats, EventRecord, ExecRecord, WithKey } from "./types";
import { getEventStartTimestamp, getEventTiming } from "@/lib/events/schedule";

const fetchAllExecs = async (): Promise<WithKey<ExecRecord>[]> =>
  apiFetch<WithKey<ExecRecord>[]>("/api/execs");

export const fetchCurrentExecs = async (): Promise<WithKey<ExecRecord>[]> =>
  (await fetchAllExecs()).filter((exec) => exec.isCurrentExec === true);

export const fetchPreviousExecs = async (): Promise<WithKey<ExecRecord>[]> =>
  (await fetchAllExecs()).filter((exec) => exec.isCurrentExec === false);

export const fetchProfile = async (): Promise<WithKey<ExecRecord> | null> =>
  apiFetch<WithKey<ExecRecord> | null>("/api/profile");

export const updateProfile = async (
  exec: Partial<ExecRecord>,
): Promise<void> => {
  await apiFetch("/api/profile", {
    method: "PATCH",
    body: JSON.stringify(exec),
  });
};

export const fetchAllEvents = async (): Promise<WithKey<EventRecord>[]> =>
  apiFetch<WithKey<EventRecord>[]>("/api/events");

export const fetchFutureEvents = async (): Promise<WithKey<EventRecord>[]> => {
  const now = Date.now();
  const events = await fetchAllEvents();

  return events.filter((event) => {
    const timing = getEventTiming(event, now);
    if (timing.isOngoing) {
      return false;
    }
    if (timing.isRecurring) {
      return timing.nextStartTimestamp !== null;
    }

    const startTimestamp = getEventStartTimestamp(event);
    return typeof startTimestamp === "number" && startTimestamp >= now;
  });
};

export const fetchEventById = async (
  eventId: string,
): Promise<WithKey<EventRecord> | null> => {
  try {
    return await apiFetch<WithKey<EventRecord>>(`/api/events/${eventId}`);
  } catch {
    return null;
  }
};

export const editEvent = async (
  eventId: string,
  event: Partial<EventRecord>,
): Promise<void> => {
  await apiFetch(`/api/events/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify(event),
  });
};

export const createEvent = async (event: EventRecord): Promise<void> => {
  await apiFetch("/api/events", {
    method: "POST",
    body: JSON.stringify(event),
  });
};

export const deleteEvent = async (eventId: string): Promise<void> => {
  await apiFetch(`/api/events/${eventId}`, { method: "DELETE" });
};

export const reviewSignup = async (
  key: string,
  action: "approve" | "reject",
): Promise<void> => {
  await apiFetch(`/api/signups/${key}`, {
    method: "PATCH",
    body: JSON.stringify({ action }),
  });
};

export const fetchInviteCode = async (): Promise<{
  code: string;
  expiresInMs: number;
}> => apiFetch("/api/invite-code");

export const stepDownAsCoPresident = async (): Promise<void> => {
  await apiFetch("/api/profile/step-down", { method: "POST" });
};

export const fetchDashboardStats = async (): Promise<DashboardStats> =>
  apiFetch<DashboardStats>("/api/stats");

export const recordPageView = async (path: string): Promise<void> => {
  await apiFetch("/api/page-view", {
    method: "POST",
    body: JSON.stringify({ path }),
    keepalive: true,
  });
};
