import type { IdentityMigrationRecord } from "@/lib/api/types";
import { activeMigrations } from "@/lib/db/identity-migrations";
import { update } from "@/lib/db/repository";
import { identityMigrationsTable } from "@/lib/db/schema";
import { ownsIdentities } from "@/lib/env";
import { leaseHeldHere, resumeMigration } from "./migration";
import { sweepRetiredUsernames } from "./retired-sweep";
import { shared } from "./shared";
import { leaseExpired } from "./view";

const SWEEP_MS = 6 * 60 * 60_000;
const FIRST_SWEEP_MS = 60_000;
const RESUME_MS = 30_000;
const RESCAN_MS = 5 * 60_000;

const state = shared("brockcsc.identityMaintenance", () => ({
  started: false,
}));

/**
 * Picks up whatever stopped without finishing. At startup any lease not
 * written by this process belongs to the container that just went away, so
 * it is dropped rather than waited out; afterwards only expired leases
 * count, and the rescan catches the ones nobody's browser is polling.
 */
const resumeStaleMigrations = async (atStartup: boolean): Promise<void> => {
  if (!ownsIdentities()) return;
  for (const record of await activeMigrations()) {
    if (record.status === "failed") continue;
    if (!leaseExpired(record)) {
      if (!atStartup || leaseHeldHere(record)) continue;
      await update<IdentityMigrationRecord>(
        identityMigrationsTable,
        record.id,
        { lease: null },
      );
    }
    await resumeMigration(record.id);
  }
};

const quietly = (label: string, work: () => Promise<unknown>) =>
  work().catch((err) => {
    console.warn(
      `${label} failed: ${err instanceof Error ? err.message : err}`,
    );
  });

/** Called once from instrumentation.ts when the Node server starts. */
export const startIdentityMaintenance = () => {
  if (state.started) return;
  state.started = true;
  setTimeout(
    () =>
      void quietly("resuming migrations", () => resumeStaleMigrations(true)),
    RESUME_MS,
  );
  setInterval(
    () =>
      void quietly("rescanning migrations", () => resumeStaleMigrations(false)),
    RESCAN_MS,
  );
  setTimeout(
    () => void quietly("retired-username sweep", sweepRetiredUsernames),
    FIRST_SWEEP_MS,
  );
  setInterval(
    () => void quietly("retired-username sweep", sweepRetiredUsernames),
    SWEEP_MS,
  );
};
