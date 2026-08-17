import { NextResponse, type NextRequest } from "next/server";
import { removeRealmRole, usersWithRealmRole } from "@/lib/auth/keycloak-admin";
import { CO_PRESIDENT } from "@/lib/auth/capabilities";
import { requireApprover } from "@/lib/auth/session";
import { syncAdminGroup, syncExpungeRights } from "@/lib/mail/provision";
import { ownsIdentities } from "@/lib/env";
import { notAuthorized } from "@/lib/json";

/** Lets a co-president step down, provided they are not the last one. */
export const POST = async (req: NextRequest) => {
  const user = await requireApprover(req);
  if (!user) return notAuthorized();

  const holders = await usersWithRealmRole(CO_PRESIDENT);
  if (!holders.some((holder) => holder.id === user.sub)) {
    return NextResponse.json(
      { error: "You do not hold the co-president role." },
      { status: 409 },
    );
  }
  if (holders.length <= 1) {
    return NextResponse.json(
      {
        error:
          "You are the only co-president. Make someone else a co-president first.",
      },
      { status: 409 },
    );
  }

  if (!ownsIdentities()) {
    return NextResponse.json(
      { error: "Role changes are only made from production." },
      { status: 409 },
    );
  }
  await removeRealmRole(user.sub, CO_PRESIDENT);
  await syncAdminGroup();
  await syncExpungeRights();
  return NextResponse.json({ remaining: holders.length - 1 });
};
