import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";

export const GET = (req: NextRequest) => {
  const user = getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.json(user);
};
