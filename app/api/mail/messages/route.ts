import { NextResponse, type NextRequest } from "next/server";
import { accessTokenFor } from "@/lib/auth/mail-token";
import { requireMember } from "@/lib/auth/session";
import { listMessages } from "@/lib/mail/jmap-mail";

export const GET = async (req: NextRequest) => {
  if (!(await requireMember(req))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const token = await accessTokenFor(req);
  if (!token) {
    return NextResponse.json({ error: "Sign in again" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const mailboxId = params.get("mailbox");
  if (!mailboxId) {
    return NextResponse.json({ error: "mailbox is required" }, { status: 400 });
  }
  const limit = Math.min(Number(params.get("limit")) || 50, 100);
  const position = Math.max(Number(params.get("position")) || 0, 0);

  return NextResponse.json(
    await listMessages(token, { mailboxId, limit, position }),
  );
};
