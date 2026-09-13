import { NextResponse, type NextRequest } from "next/server";
import type { SignupRecord } from "@/lib/api/types";
import { requireAdmin } from "@/lib/auth/session";
import { findAll } from "@/lib/db/repository";
import { signupsTable } from "@/lib/db/schema";
import { notAuthorized } from "@/lib/json";

/**
 * A minimal member picker for adding a signer: id + display name only, no
 * status/mailbox/role fields. /api/signups needs requireApprover, but any
 * exec must be able to name a member signer when proposing a signing request.
 */
export const GET = async (req: NextRequest) => {
  const user = await requireAdmin(req);
  if (!user) return notAuthorized();

  const signups = await findAll<SignupRecord>(signupsTable);
  const members = signups
    .filter((s) => s.status === "approved")
    .map((s) => ({
      id: s.id,
      name:
        [s.firstName, s.lastName].filter(Boolean).join(" ") ||
        s.username ||
        "Member",
    }));
  return NextResponse.json(members);
};
