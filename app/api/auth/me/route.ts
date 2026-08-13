import { NextResponse, type NextRequest } from "next/server";
import {
  getSessionUser,
  requireAdmin,
  requireApprover,
} from "@/lib/auth/session";

export const GET = async (req: NextRequest) => {
  const user = getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const [isExecutive, isApprover] = await Promise.all([
    requireAdmin(req),
    requireApprover(req),
  ]);
  return NextResponse.json({
    ...user,
    isExecutive: !!isExecutive,
    isApprover: !!isApprover,
  });
};
