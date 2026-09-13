import { ApiError, apiFetch } from "@/lib/api/client";
import type { SharedMailbox } from "@/app/api/mail/shared/route";

export type { SharedMailbox };

export type SharedMailboxes = {
  mailboxes: SharedMailbox[];
  domain: string;
  identitiesEditable: boolean;
};

export const errorText = (err: unknown, fallback: string) =>
  err instanceof ApiError && err.detail ? err.detail : fallback;

export const fetchSharedMailboxes = () =>
  apiFetch<SharedMailboxes>("/api/mail/shared");

export const createSharedMailbox = (input: {
  username: string;
  description?: string;
  mailDailyLimit?: number;
}) =>
  apiFetch<{ username: string; rehearsed?: true }>("/api/mail/shared", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const updateSharedMailbox = (
  username: string,
  input: Partial<{
    description: string;
    aliases: string[];
    mailDailyLimit: number;
  }>,
) =>
  apiFetch<{ rehearsed?: true }>(
    `/api/mail/shared/${encodeURIComponent(username)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );

export const deleteSharedMailbox = (username: string) =>
  apiFetch<{ rehearsed?: true } | undefined>(
    `/api/mail/shared/${encodeURIComponent(username)}`,
    { method: "DELETE" },
  );
