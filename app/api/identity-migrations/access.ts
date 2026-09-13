import type { NextRequest } from "next/server";
import type { IdentityMigrationRecord, SessionUser } from "@/lib/api/types";
import { getSessionUser, requireApprover } from "@/lib/auth/session";
import type { Entity } from "@/lib/db/repository";

/**
 * Never requireMember: after db:repoint the old sub finds no sign-up, yet
 * that browser is the one polling. Either side of the record, or an
 * approver.
 */
export const migrationViewer = async (
  req: NextRequest,
  record: Entity<IdentityMigrationRecord>,
): Promise<{ user: SessionUser; own: boolean; approver: boolean } | null> => {
  const user = getSessionUser(req);
  if (!user) return null;
  const own =
    record.from.keycloakUserId === user.sub ||
    record.to.keycloakUserId === user.sub;
  const approver = !own && !!(await requireApprover(req));
  return own || approver ? { user, own, approver } : null;
};
