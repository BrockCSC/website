import type {
  IdentityMigrationRecord,
  IdentityMigrationView,
} from "@/lib/api/types";
import type { Entity } from "@/lib/db/repository";
import { FIRST_CUTOVER_STEP, STEP_LIST } from "./step-list";

export const leaseExpired = (record: IdentityMigrationRecord) =>
  !record.lease || new Date(record.lease.until).getTime() <= Date.now();

export const migrationView = (
  record: Entity<IdentityMigrationRecord>,
): IdentityMigrationView => {
  const active = !["done", "aborted"].includes(record.status);
  const stale = leaseExpired(record);
  const idle = record.status === "failed" || stale;
  return {
    $key: record.id,
    signupId: record.signupId,
    mode: record.mode,
    status: record.status,
    step: record.step,
    requestedAt: record.requestedAt,
    requestedBy: record.requestedBy.kind,
    passwordSource: record.passwordSource,
    from: record.from.username,
    to: record.to.username,
    cutOverAt: record.cutOverAt,
    forwardUntil: record.forwardUntil,
    handoff: record.handoff,
    verification: record.verification,
    error: record.error ?? undefined,
    steps: STEP_LIST.map((meta) => ({
      ...meta,
      ...(record.steps[meta.id] ?? { status: "pending", attempts: 0 }),
    })),
    messages: {
      copied: Object.keys(record.copied).length,
      total: Object.values(record.mailboxes).reduce(
        (sum, box) => sum + box.old.total,
        0,
      ),
    },
    leaseExpired: stale,
    canAbort:
      active && idle && record.steps[FIRST_CUTOVER_STEP]?.status === "pending",
    canResume: active && idle,
  };
};
