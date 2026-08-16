import { NextResponse, type NextRequest } from "next/server";
import {
  getSessionUser,
  invalidateRoles,
  requireAdmin,
  requireApprover,
  requireMember,
} from "@/lib/auth/session";

/** The admin UI polls this to keep its tabs honest, so it reads Keycloak fresh
 * rather than trusting the cache it then repopulates for the gated routes. */
export const GET = async (req: NextRequest) => {
  const user = getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  invalidateRoles(user.sub);

  const [isExecutive, isApprover, member] = await Promise.all([
    requireAdmin(req),
    requireApprover(req),
    requireMember(req),
  ]);
  return NextResponse.json({
    ...user,
    // Live, unlike the roles baked into the session cookie at login.
    roles: member?.roles ?? [],
    isExecutive: !!isExecutive,
    isApprover: !!isApprover,
    isMember: !!member,
  });
};
