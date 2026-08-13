import { NextResponse, type NextRequest } from "next/server";
import { removeRealmRole, usersWithRealmRole } from "@/lib/auth/keycloak-admin";
import { requireApprover } from "@/lib/auth/session";

const CO_PRESIDENT_ROLE = "co-president";

/** Lets a co-president step down, provided they are not the last one. */
export const POST = async (req: NextRequest) => {
  const user = await requireApprover(req);
  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const holders = await usersWithRealmRole(CO_PRESIDENT_ROLE);
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

  await removeRealmRole(user.sub, CO_PRESIDENT_ROLE);
  return NextResponse.json({ remaining: holders.length - 1 });
};
