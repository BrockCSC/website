import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, requireApprover } from "@/lib/auth/session";

export const GET = async (req: NextRequest) => {
  const user = getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.json({
    ...user,
    isApprover: !!(await requireApprover(req)),
  });
};
