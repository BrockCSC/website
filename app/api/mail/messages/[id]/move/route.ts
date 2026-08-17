import { NextResponse, type NextRequest } from "next/server";
import { accessTokenFor } from "@/lib/auth/mail-token";
import { requireMember } from "@/lib/auth/session";
import { moveMessage } from "@/lib/mail/jmap-mail";

const DESTINATIONS = ["trash", "archive"] as const;

export const POST = async (
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

  const body = (await req.json().catch(() => null)) as { to?: unknown } | null;
  const to = DESTINATIONS.find((name) => name === body?.to);
  if (!to) {
    return NextResponse.json(
      { error: `to must be one of ${DESTINATIONS.join(", ")}` },
      { status: 400 },
    );
  }

  const { id } = await params;
  await moveMessage(token, id, to);
  return NextResponse.json({ ok: true });
};
