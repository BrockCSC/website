import { ApiError, apiFetch } from "@/lib/api/client";
import type { Alias, AliasDirectory, Recipients } from "@/lib/mail/aliases";

export type {
  Alias,
  AliasDirectory,
  Delivered,
  Recipients,
} from "@/lib/mail/aliases";

export type AliasInput = {
  name: string;
  description: string;
  aliases: string[];
  recipients: Recipients;
};

export type Saved = Alias | { rehearsed: true; alias: Alias };

export const errorText = (err: unknown, fallback: string) =>
  err instanceof ApiError && err.detail ? err.detail : fallback;

export const fetchAliases = () => apiFetch<AliasDirectory>("/api/mail/aliases");

export const createAlias = (input: AliasInput) =>
  apiFetch<Saved>("/api/mail/aliases", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const updateAlias = (name: string, input: Partial<AliasInput>) =>
  apiFetch<Saved>(`/api/mail/aliases/${name}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

export const deleteAlias = (name: string) =>
  apiFetch<{ rehearsed?: true } | undefined>(`/api/mail/aliases/${name}`, {
    method: "DELETE",
  });

export const setCatchAll = (address: string | null) =>
  apiFetch<{ address: string | null; rehearsed?: true }>(
    "/api/mail/catch-all",
    { method: "PUT", body: JSON.stringify({ address }) },
  );

export const setForwarding = (forwardTo: string | null, off?: string[]) =>
  apiFetch<{ forwardTo: string | null; rehearsed?: true }>(
    "/api/mail/forwarding",
    { method: "PUT", body: JSON.stringify({ forwardTo, off }) },
  );

export const syncAliases = () =>
  apiFetch<{ rehearsed?: true }>("/api/mail/aliases/sync", { method: "POST" });
