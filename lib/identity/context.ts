import type { IdentityMigrationRecord } from "@/lib/api/types";
import type { Entity } from "@/lib/db/repository";

/** What a step sees: the live record, and a save that persists and refreshes it. */
export type MigrationCtx = {
  record: Entity<IdentityMigrationRecord>;
  save: (patch: Partial<IdentityMigrationRecord>) => Promise<void>;
};

export const sameSet = (a: string[], b: string[]) =>
  a.length === new Set(a).size &&
  new Set(a).size === new Set(b).size &&
  a.every((value) => b.includes(value));

export const on = (map: Record<string, boolean> | undefined) =>
  Object.entries(map ?? {})
    .filter(([, set]) => set)
    .map(([key]) => key);
