import { NextResponse, type NextRequest } from "next/server";
import { accessTokenFor } from "@/lib/auth/mail-token";
import { requireMember } from "@/lib/auth/session";
import { listMailboxes } from "@/lib/mail/jmap-mail";

export const GET = async (req: NextRequest) => {
  if (!(await requireMember(req))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const token = await accessTokenFor(req);
  if (!token) {
    return NextResponse.json({ error: "Sign in again" }, { status: 401 });
  }
  return NextResponse.json(await listMailboxes(token));
};
