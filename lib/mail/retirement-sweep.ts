import type { RetiredMailboxRecord } from "@/lib/api/types";
import { update } from "@/lib/db/repository";
import { retiredMailboxesTable } from "@/lib/db/schema";
import { listRetiredMailboxes } from "@/lib/db/retired-mailboxes";
import { ownsIdentities } from "@/lib/env";
import { deleteMailingList, listMailingLists } from "./stalwart";

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/** Removes a retired mailbox's forwarding list once its 30 days are up. */
const sweepOnce = async (): Promise<void> => {
  if (!ownsIdentities()) return;

  const due = (await listRetiredMailboxes()).filter(
    (row) => !row.removed && new Date(row.removeAt) <= new Date(),
  );
  if (!due.length) return;

  for (const row of due) {
    try {
      await deleteMailingList(row.mailingListId);
    } catch (err) {
      const stillThere = await listMailingLists()
        .then((lists) => lists.some((list) => list.id === row.mailingListId))
        .catch(() => true);
      if (stillThere) {
        console.error(
          `retirement sweep: could not remove ${row.username}'s forwarding list: ${err instanceof Error ? err.message : err}`,
        );
        continue;
      }
    }
    await update<RetiredMailboxRecord>(retiredMailboxesTable, row.id, {
      removed: true,
    });
  }
};

export const startRetirementSweep = (): void => {
  void sweepOnce();
  setInterval(() => void sweepOnce(), SWEEP_INTERVAL_MS).unref();
};
