import { NextResponse, type NextRequest } from "next/server";
import { moveMessages } from "@/lib/mail/jmap-mail";
import { mailToken, unauthorized } from "../../../auth";

const ROLES = ["trash", "archive"] as const;

export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const token = await mailToken(req);
  if (!token) return unauthorized();

  const body = (await req.json().catch(() => null)) as {
    to?: unknown;
    mailboxId?: unknown;
  } | null;
  const role = ROLES.find((name) => name === body?.to);
  const mailboxId =
    typeof body?.mailboxId === "string" ? body.mailboxId : undefined;
  if (!role && !mailboxId) {
    return NextResponse.json(
      { error: `to must be one of ${ROLES.join(", ")}, or give a mailboxId` },
      { status: 400 },
    );
  }

  const { id } = await params;
  await moveMessages(token, [id], { role, mailboxId });
  return NextResponse.json({ ok: true });
};
