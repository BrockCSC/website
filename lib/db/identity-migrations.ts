import { sql } from "drizzle-orm";
import type {
  IdentityMigrationRecord,
  MigrationStatus,
  RetiredUsernameRecord,
} from "@/lib/api/types";
import {
  create,
  findAll,
  findById,
  updateWhere,
  type Entity,
} from "./repository";
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

const leaseColumn = sql`${identityMigrationsTable.data}->'lease'`;

const leaseFreeOrHeldBy = (runner: string) =>
  sql`(${leaseColumn} IS NULL OR jsonb_typeof(${leaseColumn}) = 'null' OR (${leaseColumn}->>'until')::timestamptz <= ${new Date().toISOString()}::timestamptz OR ${leaseColumn}->>'by' = ${runner})`;

const leaseHeldBy = (runner: string) =>
  sql`${leaseColumn}->>'by' = ${runner}`;

/**
 * Takes or renews the lease in one conditional statement: it succeeds only
 * when nobody holds a live lease, or this runner already does. Null means
 * another runner has it.
 */
export const claimMigrationLease = (
  id: string,
  runner: string,
  until: string,
  patch: Partial<IdentityMigrationRecord> = {},
) =>
  updateWhere<IdentityMigrationRecord>(
    identityMigrationsTable,
    id,
    leaseFreeOrHeldBy(runner),
    { ...patch, lease: { until, by: runner } },
  );

/** Writes only while the runner still holds the lease, so a runner that lost it cannot overwrite the one that took it. */
export const saveWhileLeased = (
  id: string,
  runner: string,
  until: string,
  patch: Partial<IdentityMigrationRecord>,
) =>
  updateWhere<IdentityMigrationRecord>(
    identityMigrationsTable,
    id,
    leaseHeldBy(runner),
    { ...patch, lease: { until, by: runner } },
  );

export const listRetiredUsernames = () =>
  findAll<RetiredUsernameRecord>(retiredUsernamesTable);

/**
 * Retired for good (a former username or any alias it carried), or spoken
 * for by a rename that is still in flight. Checked for usernames and for
 * dotted aliases alike.
 */
export const isUsernameReserved = async (
  localPart: string,
): Promise<boolean> => {
  const wanted = localPart.toLowerCase();
  const [retired, active] = await Promise.all([
    listRetiredUsernames(),
    activeMigrations(),
  ]);
  return (
    retired.some(
      (row) => row.localPart === wanted || row.aliases.includes(wanted),
    ) ||
    active.some(
      (record) =>
        record.to.username === wanted ||
        record.from.username === wanted ||
        record.from.aliases.includes(wanted) ||
        record.to.dottedAlias === wanted,
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
