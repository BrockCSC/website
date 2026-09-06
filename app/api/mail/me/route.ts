import { NextResponse, type NextRequest } from "next/server";
import { sendingAddress } from "@/lib/mail/jmap-mail";
import { mailScope, unauthorized } from "../auth";

export const GET = async (req: NextRequest) => {
  const scope = await mailScope(req);
  if (!scope) return unauthorized();
  if (scope.viewing) {
    return NextResponse.json({
      email: scope.viewing.emailAddress,
      viewing: true,
    });
  }

  try {
    return NextResponse.json({ email: await sendingAddress(scope.access) });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the mail server" },
      { status: 502 },
    );
  }
};
