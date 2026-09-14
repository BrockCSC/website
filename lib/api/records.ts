import { apiFetch } from "./client";
import type {
  DashboardStats,
  EventRecord,
  ExecRecord,
  IdentityMigrationView,
  RenamePreview,
  WithKey,
} from "./types";

const fetchAllExecs = async (): Promise<WithKey<ExecRecord>[]> =>
  apiFetch<WithKey<ExecRecord>[]>("/api/execs");

export const fetchCurrentExecs = async (): Promise<WithKey<ExecRecord>[]> =>
  (await fetchAllExecs()).filter((exec) => exec.isCurrentExec === true);

export const fetchPreviousExecs = async (): Promise<WithKey<ExecRecord>[]> =>
  (await fetchAllExecs()).filter((exec) => exec.isCurrentExec === false);

export type ProfileRecord = WithKey<ExecRecord> & { accessCardId?: string };

export const fetchProfile = async (): Promise<ProfileRecord | null> =>
  apiFetch<ProfileRecord | null>("/api/profile");

export const updateProfile = async (
  exec: Partial<ExecRecord> & { accessCardId?: string },
): Promise<void> => {
  await apiFetch("/api/profile", {
    method: "PATCH",
    body: JSON.stringify(exec),
  });
};

export type OwnDetails = {
  firstName: string;
  lastName: string;
  email: string;
  studentId: string;
  accessCardId: string;
  username: string;
  address: string;
  previousUsernames: string[];
  passwordResetRequired: boolean;
  identitiesEditable: boolean;
  pendingMigrationId: string | null;
};

export const fetchOwnDetails = async (): Promise<OwnDetails> =>
  apiFetch<OwnDetails>("/api/profile/details");

export type OwnDetailsPatch = Partial<
  Pick<OwnDetails, "firstName" | "lastName" | "email" | "studentId">
> & { currentPassword?: string };

/**
 * Not apiFetch: a 409 carrying `rename` is an answer, not a failure. The
 * server has checked the password and is asking for a second confirmation.
 */
export const updateOwnDetails = async (
  patch: OwnDetailsPatch,
): Promise<
  | { saved: OwnDetails }
  | { rename: RenamePreview }
  | { error: string; status: number }
> => {
  const res = await fetch("/api/profile/details", {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { saved: body as OwnDetails };
  if (res.status === 409 && body.rename === true) {
    return { rename: body as unknown as RenamePreview };
  }
  return {
    error: typeof body.error === "string" ? body.error : "Could not save that.",
    status: res.status,
  };
};

export const startRename = async (input: {
  firstName: string;
  lastName: string;
  currentPassword: string;
}): Promise<{ migrationId: string; rehearsal: boolean }> =>
  apiFetch("/api/profile/rename", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const fetchMigration = async (
  id: string,
): Promise<IdentityMigrationView> =>
  apiFetch<IdentityMigrationView>(`/api/identity-migrations/${id}`);

export const handoffMigrationSession = async (
  id: string,
): Promise<{
  signedIn?: boolean;
  relogin?: boolean;
  done?: boolean;
  username: string;
}> => apiFetch(`/api/identity-migrations/${id}/session`, { method: "POST" });

export const abortMigration = async (
  id: string,
): Promise<IdentityMigrationView> =>
  apiFetch(`/api/identity-migrations/${id}/abort`, { method: "POST" });

export const fetchAllEvents = async (): Promise<WithKey<EventRecord>[]> =>
  apiFetch<WithKey<EventRecord>[]>("/api/events");

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
