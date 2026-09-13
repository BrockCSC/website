import { NextResponse, type NextRequest } from "next/server";
import {
  getSessionUser,
  invalidateRoles,
  requireAdmin,
  requireApprover,
  requireMailAdmin,
  requireMember,
} from "@/lib/auth/session";
import { findActiveMigrationForSub } from "@/lib/db/identity-migrations";
import { ownsIdentities } from "@/lib/env";
import { resumeIfStale } from "@/lib/identity/migration";

/** Reads Keycloak fresh, repopulating the cache the gated routes share. */
export const GET = async (req: NextRequest) => {
  const user = getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  invalidateRoles(user.sub);
  // The member's own polling browser picks their rename back up after a deploy.
  if (ownsIdentities()) {
    const migration = await findActiveMigrationForSub(user.sub).catch(
      () => null,
    );
    if (migration) resumeIfStale(migration);
  }

  const [isExecutive, isApprover, isMailAdmin, member] = await Promise.all([
    requireAdmin(req),
    requireApprover(req),
    requireMailAdmin(req),
    requireMember(req),
  ]);
  return NextResponse.json({
    ...user,
    // Live, unlike the roles baked into the session cookie at login.
    roles: member?.roles ?? [],
    isExecutive: !!isExecutive,
    isApprover: !!isApprover,
    isMailAdmin: !!isMailAdmin,
    isMember: !!member,
    identitiesEditable: ownsIdentities(),
  });
};
