import type { SharedMailboxRecord } from "@/lib/api/types";
import { findAll } from "./repository";
import { sharedMailboxesTable } from "./schema";

export const listSharedMailboxes = () =>
  findAll<SharedMailboxRecord>(sharedMailboxesTable);

export const findSharedMailbox = async (username: string) =>
  (await listSharedMailboxes()).find((row) => row.username === username) ??
  null;
