import type {
  IdentityMigrationRecord,
  MigrationStatus,
  RetiredUsernameRecord,
} from "@/lib/api/types";
import { create, findAll, findById, type Entity } from "./repository";
import { identityMigrationsTable, retiredUsernamesTable } from "./schema";

const TERMINAL: MigrationStatus[] = ["done", "aborted"];

/** A failed migration is still active: the identity is half-moved until it is resumed. */
export const isActiveMigration = (record: IdentityMigrationRecord) =>
  record.mode === "real" && !TERMINAL.includes(record.status);

export const findMigration = (id: string) =>
  findById<IdentityMigrationRecord>(identityMigrationsTable, id);

const allMigrations = () =>
  findAll<IdentityMigrationRecord>(identityMigrationsTable);

export const listMigrationsForSignup = async (
  signupId: string,
): Promise<Entity<IdentityMigrationRecord>[]> =>
  (await allMigrations())
    .filter((record) => record.signupId === signupId)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));

export const findActiveMigrationForSignup = async (signupId: string) =>
  (await allMigrations()).find(
    (record) => record.signupId === signupId && isActiveMigration(record),
  ) ?? null;

/** Matches either side, since the member's session carries the old sub until handoff. */
export const findActiveMigrationForSub = async (sub: string) =>
  (await allMigrations()).find(
    (record) =>
      isActiveMigration(record) &&
      (record.from.keycloakUserId === sub || record.to.keycloakUserId === sub),
  ) ?? null;

export const activeMigrations = async () =>
  (await allMigrations()).filter(isActiveMigration);

export const listRetiredUsernames = () =>
  findAll<RetiredUsernameRecord>(retiredUsernamesTable);

/** Retired for good, or spoken for by a rename that is still in flight. */
export const isUsernameReserved = async (
  localPart: string,
): Promise<boolean> => {
  const wanted = localPart.toLowerCase();
  const [retired, active] = await Promise.all([
    listRetiredUsernames(),
    activeMigrations(),
  ]);
  return (
    retired.some((row) => row.localPart === wanted) ||
    active.some(
      (record) =>
        record.to.username === wanted || record.from.username === wanted,
    )
  );
};

export const retireUsername = async (
  record: RetiredUsernameRecord,
): Promise<Entity<RetiredUsernameRecord>> => {
  const existing = (await listRetiredUsernames()).find(
    (row) => row.localPart === record.localPart,
  );
  return (
    existing ?? create<RetiredUsernameRecord>(retiredUsernamesTable, record)
  );
};

export const retiredDueForSweep = async (now = new Date()) =>
  (await listRetiredUsernames()).filter(
    (row) => !row.sweptAt && new Date(row.forwardUntil) <= now,
  );
