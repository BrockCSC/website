import type { NextRequest } from "next/server";
import { requireMember } from "@/lib/auth/session";
import { findSignupByUserId } from "@/lib/db/signups";

/**
 * The caller's own mailbox name, never one they asked for: these routes act
 * with the Stalwart admin credential, so the local part cannot come from the
 * request.
 */
export const ownMailbox = async (req: NextRequest): Promise<string | null> => {
  const user = await requireMember(req);
  if (!user) return null;
  const signup = await findSignupByUserId(user.sub);
  return signup?.username ?? null;
};
