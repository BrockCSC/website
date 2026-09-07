import { NextResponse, type NextRequest } from "next/server";
import { moveMessages } from "@/lib/mail/jmap-mail";
import { mailWriter } from "../../../auth";
import { jsonObject } from "@/lib/json";

const ROLES = ["trash", "archive"] as const;

export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const scope = await mailWriter(req);
  if (scope instanceof NextResponse) return scope;

  const body = await jsonObject<{ to?: unknown; mailboxId?: unknown }>(req);
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
  await moveMessages(scope.access, [id], { role, mailboxId });
  return NextResponse.json({ ok: true });
};
