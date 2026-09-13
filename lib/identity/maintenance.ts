import { activeMigrations } from "@/lib/db/identity-migrations";
import { ownsIdentities } from "@/lib/env";
import { resumeMigration } from "./migration";
import { sweepRetiredUsernames } from "./retired-sweep";
import { leaseExpired } from "./view";

const SWEEP_MS = 6 * 60 * 60_000;
const FIRST_SWEEP_MS = 60_000;
const RESUME_MS = 30_000;

let started = false;

/** Picks up whatever a restart interrupted: the lease has expired by now. */
export const resumeStaleMigrations = async (): Promise<void> => {
  if (!ownsIdentities()) return;
  for (const record of await activeMigrations()) {
    if (record.status !== "failed" && leaseExpired(record)) {
      await resumeMigration(record.id);
    }
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
  if (started) return;
  started = true;
  setTimeout(
    () => void quietly("resuming migrations", resumeStaleMigrations),
    RESUME_MS,
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
