import { NextResponse, type NextRequest } from "next/server";
import { currentInviteCode, inviteCodeExpiresIn } from "@/lib/auth/invite-code";
import { requireAdmin } from "@/lib/auth/session";

export const GET = (req: NextRequest) => {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  return NextResponse.json({
    code: currentInviteCode(),
    expiresInMs: inviteCodeExpiresIn(),
  });
};
