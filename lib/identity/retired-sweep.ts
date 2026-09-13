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
  listSieveScripts,
  putSieveScript,
  removeSieveScript,
  setAccountAliases,
} from "@/lib/mail/stalwart";
import { RETIRED_NOTICE_SCRIPT, retiredNoticeScript } from "./retired-notice";

const address = (localPart: string) => `${localPart}@${domain()}`;

const stillForwarding = (row: RetiredUsernameRecord, now: Date) =>
  !row.sweptAt && new Date(row.forwardUntil) > now;

/** Rewrites the notice for whatever the successor still forwards, or removes it. */
export const refreshRetiredNotice = async (
  successor: string,
  rows: Entity<RetiredUsernameRecord>[],
  include: string | null = null,
): Promise<void> => {
  const accountId = await accountIdOf(successor);
  if (!accountId) return;
  const now = new Date();
  const live = rows.filter(
    (row) => row.successor === successor && stillForwarding(row, now),
  );
  if (!live.length) {
    await removeSieveScript(accountId, RETIRED_NOTICE_SCRIPT);
    return;
  }
  const existing = (await listSieveScripts(accountId)).find(
    (script) => script.name === RETIRED_NOTICE_SCRIPT,
  );
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
    existing?.isActive ?? false,
  );
};

/** Detaches every retired address whose 90 days are up. Returns how many. */
export const sweepRetiredUsernames = async (): Promise<number> => {
  if (!ownsIdentities()) return 0;
  const due = await retiredDueForSweep();
  if (!due.length) return 0;
  const all = await listRetiredUsernames();
  let swept = 0;
  for (const row of due) {
    try {
      const current = await accountAliases(row.successor);
      const drop = new Set([row.localPart, ...row.aliases]);
      const kept = current.filter((alias) => !drop.has(alias));
      if (kept.length !== current.length) {
        await setAccountAliases(row.successor, kept, domain());
      }
      await update<RetiredUsernameRecord>(retiredUsernamesTable, row.id, {
        sweptAt: new Date().toISOString(),
      });
      await refreshRetiredNotice(
        row.successor,
        all.filter((one) => one.id !== row.id),
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
