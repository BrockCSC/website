import type { RetiredUsernameRecord } from "@/lib/api/types";
import {
  listRetiredUsernames,
  retiredDueForSweep,
} from "@/lib/db/identity-migrations";
import { type Entity, update } from "@/lib/db/repository";
import { retiredUsernamesTable } from "@/lib/db/schema";
import { ownsIdentities } from "@/lib/env";
import { domain } from "@/lib/mail/provision";
import {
  accountAliases,
  accountIdOf,
  createMailbox,
  listSieveScripts,
  localPartTaken,
  makeReadOnly,
  putSieveScript,
  removeSieveScript,
  setAccountAliases,
} from "@/lib/mail/stalwart";
import {
  RETIRED_NOTICE_SCRIPT,
  RETIRED_REJECT_SCRIPT,
  RETIRED_SINK,
  retiredNoticeScript,
  retiredRejectScript,
} from "./retired-notice";

const address = (localPart: string) => `${localPart}@${domain()}`;

const stillForwarding = (row: RetiredUsernameRecord, now: Date) =>
  !row.sweptAt && new Date(row.forwardUntil) > now;

/**
 * The member's own script the notice wraps: the latest rename onto this
 * successor that recorded one. Rows a plain name edit retired carry no
 * script of their own and must not erase it.
 */
const includedScript = (rows: RetiredUsernameRecord[]) =>
  [...rows]
    .sort((a, b) => a.retiredAt.localeCompare(b.retiredAt))
    .map((row) => row.includedScript)
    .filter((name): name is string => !!name)
    .at(-1) ?? null;

/**
 * Rewrites the notice for whatever the successor still forwards, or removes
 * it and hands activation back to the member's own script. Never installs
 * one: that is the migration's job, and an alias retired by a plain name
 * edit carries no notice.
 */
const refreshRetiredNotice = async (
  successor: string,
  rows: Entity<RetiredUsernameRecord>[],
): Promise<void> => {
  const accountId = await accountIdOf(successor);
  if (!accountId) return;
  const existing = (await listSieveScripts(accountId)).find(
    (script) => script.name === RETIRED_NOTICE_SCRIPT,
  );
  if (!existing) return;
  const now = new Date();
  const mine = rows.filter((row) => row.successor === successor);
  const live = mine.filter((row) => stillForwarding(row, now));
  const include = includedScript(mine);
  if (!live.length) {
    await removeSieveScript(accountId, RETIRED_NOTICE_SCRIPT, include);
    return;
  }
  await putSieveScript(
    accountId,
    RETIRED_NOTICE_SCRIPT,
    retiredNoticeScript({
      retired: live
        .flatMap((row) => [row.localPart, ...row.aliases])
        .map(address),
      successor: address(successor),
      forwardUntil: live
        .map((row) => row.forwardUntil)
        .sort()
        .at(-1)!,
      include,
    }),
    existing.isActive,
  );
};

/** The account retired addresses end up on: cannot send, nobody can log in, and refuses everything with a bounce. */
const ensureRetiredSink = async (): Promise<void> => {
  if (!(await localPartTaken(RETIRED_SINK))) {
    await createMailbox({
      localPart: RETIRED_SINK,
      displayName: "Retired addresses",
      domain: domain(),
    });
  }
  await makeReadOnly(RETIRED_SINK);
  const accountId = await accountIdOf(RETIRED_SINK);
  if (!accountId) throw new Error(`Stalwart has no account "${RETIRED_SINK}".`);
  const active = (await listSieveScripts(accountId)).some(
    (script) => script.name === RETIRED_REJECT_SCRIPT && script.isActive,
  );
  if (!active) {
    await putSieveScript(
      accountId,
      RETIRED_REJECT_SCRIPT,
      retiredRejectScript(),
      true,
    );
  }
};

/** Moves every retired address whose 90 days are up onto the sink. Returns how many. */
export const sweepRetiredUsernames = async (): Promise<number> => {
  if (!ownsIdentities()) return 0;
  const due = await retiredDueForSweep();
  if (!due.length) return 0;
  await ensureRetiredSink();
  const all = await listRetiredUsernames();
  let swept = 0;
  for (const row of due) {
    try {
      const drop = new Set([row.localPart, ...row.aliases]);
      const current = await accountAliases(row.successor);
      const kept = current.filter((alias) => !drop.has(alias));
      if (kept.length !== current.length) {
        await setAccountAliases(row.successor, kept, domain());
      }
      // Stalwart frees the address on the successor first; the sink takes it
      // in the next call so it keeps rejecting instead of hitting the catch-all.
      await setAccountAliases(
        RETIRED_SINK,
        [...new Set([...(await accountAliases(RETIRED_SINK)), ...drop])],
        domain(),
      );
      const stamped = await update<RetiredUsernameRecord>(
        retiredUsernamesTable,
        row.id,
        { sweptAt: new Date().toISOString() },
      );
      await refreshRetiredNotice(
        row.successor,
        all.map((one) => (one.id === row.id && stamped ? stamped : one)),
      );
      swept++;
    } catch (err) {
      console.warn(
        `could not retire ${row.localPart}@${domain()} from ${row.successor}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  return swept;
};
