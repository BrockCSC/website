import { NextResponse, type NextRequest } from "next/server";
import { sendingAddress } from "@/lib/mail/jmap-mail";
import { mailToken, unauthorized } from "../auth";

export const GET = async (req: NextRequest) => {
  const token = await mailToken(req);
  if (!token) return unauthorized();

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
