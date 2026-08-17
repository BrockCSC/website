import { NextResponse, type NextRequest } from "next/server";
import { accessTokenFor } from "@/lib/auth/mail-token";
import { requireMember } from "@/lib/auth/session";
import { sendingAddress } from "@/lib/mail/jmap-mail";

export const GET = async (req: NextRequest) => {
  if (!(await requireMember(req))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const token = await accessTokenFor(req);
  if (!token) {
    return NextResponse.json({ error: "Sign in again" }, { status: 401 });
  }

  // A null email means "this account has no mailbox" and hides Mail, so a
  // server that simply could not be reached must not answer with one.
  try {
    return NextResponse.json({ email: await sendingAddress(token) });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the mail server" },
      { status: 502 },
    );
  }
};
