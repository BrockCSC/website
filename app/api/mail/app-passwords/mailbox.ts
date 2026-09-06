import type { NextRequest, NextResponse } from "next/server";
import { requireMember } from "@/lib/auth/session";
import { findSignupByUserId } from "@/lib/db/signups";
import { notAuthorized } from "@/lib/json";
import { viewOnly } from "../auth";

/**
 * The caller's own mailbox name, never one they asked for: these routes act
 * with the Stalwart admin credential, so the local part cannot come from the
 * request.
 */
export const ownMailbox = async (
  req: NextRequest,
): Promise<string | NextResponse> => {
  if (new URL(req.url).searchParams.has("as")) return viewOnly();
  const user = await requireMember(req);
  if (!user) return notAuthorized();
  const signup = await findSignupByUserId(user.sub);
  return signup?.username ?? notAuthorized();
};
