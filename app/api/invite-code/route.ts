import { NextResponse, type NextRequest } from "next/server";
import { currentInviteCode, inviteCodeExpiresIn } from "@/lib/auth/invite-code";
import { requireAdmin } from "@/lib/auth/session";
import { notAuthorized } from "@/lib/json";

export const GET = async (req: NextRequest) => {
  if (!(await requireAdmin(req))) return notAuthorized();
  return NextResponse.json({
    code: currentInviteCode(),
    expiresInMs: inviteCodeExpiresIn(),
  });
};
