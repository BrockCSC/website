import { NextResponse, type NextRequest } from "next/server";
import { moveMessages } from "@/lib/mail/jmap-mail";
import { mailWriter } from "../../../auth";
import { jsonObject } from "@/lib/json";

const ROLES = ["trash", "archive"] as const;
const MAX_IDS = 200;

export const POST = async (req: NextRequest) => {
  const scope = await mailWriter(req);
  if (scope instanceof NextResponse) return scope;

  const body = await jsonObject<{
    ids?: unknown;
    to?: unknown;
    mailboxId?: unknown;
  }>(req);
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((id): id is string => typeof id === "string")
    : [];
  const role = ROLES.find((name) => name === body?.to);
  const mailboxId =
    typeof body?.mailboxId === "string" ? body.mailboxId : undefined;
  if (!ids.length || ids.length > MAX_IDS || (!role && !mailboxId)) {
    return NextResponse.json(
      {
        error: `Give 1-${MAX_IDS} ids and to as one of ${ROLES.join(", ")}, or a mailboxId`,
      },
      { status: 400 },
    );
  }

  await moveMessages(scope.access, ids, { role, mailboxId });
  return NextResponse.json({ ok: true });
};
