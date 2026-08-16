import { NextResponse, type NextRequest } from "next/server";
import { accessTokenFor } from "@/lib/auth/mail-token";
import { requireMember } from "@/lib/auth/session";
import { getMessage } from "@/lib/mail/jmap-mail";

export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  if (!(await requireMember(req))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const token = await accessTokenFor(req);
  if (!token) {
    return NextResponse.json({ error: "Sign in again" }, { status: 401 });
  }
  const { id } = await params;
  return NextResponse.json(await getMessage(token, id));
};
