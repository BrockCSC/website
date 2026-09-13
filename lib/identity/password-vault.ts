/**
 * The plaintext a rename needs twice: once to give the new Keycloak user a
 * credential, once to sign the member in as it. Process memory only, short
 * TTL, never persisted. If it is gone by hand-off, the member signs in again.
 */

const TTL_MS = 15 * 60_000;

const entries = new Map<string, { password: string; expiresAt: number }>();

const sweep = () => {
  const now = Date.now();
  for (const [id, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(id);
  }
};

export const stashPassword = (
  migrationId: string,
  password: string,
  ttlMs = TTL_MS,
) => {
  sweep();
  entries.set(migrationId, { password, expiresAt: Date.now() + ttlMs });
};

export const peekPassword = (migrationId: string): string | null => {
  sweep();
  return entries.get(migrationId)?.password ?? null;
};

export const forgetPassword = (migrationId: string) => {
  entries.delete(migrationId);
};
