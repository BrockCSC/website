import type { RetiredMailboxRecord } from "@/lib/api/types";
import { findAll } from "./repository";
import { retiredMailboxesTable } from "./schema";

export const listRetiredMailboxes = () =>
  findAll<RetiredMailboxRecord>(retiredMailboxesTable);

/** Retired for good, or still mid-forward: either way the name is spoken for. */
export const findActiveRetiredMailbox = async (username: string) =>
  (await listRetiredMailboxes()).find(
    (row) => row.username === username && !row.removed,
  ) ?? null;
