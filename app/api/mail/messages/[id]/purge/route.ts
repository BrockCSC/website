import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { MailDeletionRequest, SignupRecord } from "@/lib/api/types";
import { update } from "@/lib/db/repository";
import { signupsTable } from "@/lib/db/schema";
import { findSignupByUserId } from "@/lib/db/signups";
import { jsonObject } from "@/lib/json";
import { destroyMessages, subjectOf } from "@/lib/mail/jmap-mail";
import { isProtectedMailbox } from "@/lib/mail/provision";
import { mailUser, unauthorized } from "../../../auth";

/** Records a request only: destroying club mail is an approver's call. */
export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const session = await mailUser(req);
  if (!session) return unauthorized();

  const { id } = await params;
  const signup = await findSignupByUserId(session.user.sub);
  if (signup?.username && isProtectedMailbox(signup.username)) {
    return NextResponse.json({
      purged: await destroyMessages(session.token, [id]),
    });
  }
  if (!signup) {
    return NextResponse.json({ error: "No linked account" }, { status: 404 });
  }

  const requests = signup.mailDeletionRequests ?? [];
  if (
    requests.some(
      (request) =>
        (request.status === "pending" || request.status === "approved") &&
        request.messageIds.includes(id),
    )
  ) {
    return NextResponse.json(
      { error: "That message is already waiting on a co-president." },
      { status: 409 },
    );
  }

  const body = await jsonObject<{ reason?: unknown }>(req);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const request: MailDeletionRequest = {
    id: randomUUID(),
    messageIds: [id],
    subject: (await subjectOf(session.token, id)) ?? undefined,
    reason: reason ? reason.slice(0, 500) : undefined,
    requestedAt: new Date().toISOString(),
    status: "pending",
  };

  await update<SignupRecord>(signupsTable, signup.id, {
    mailDeletionRequests: [...requests, request],
  });
  return NextResponse.json({ requested: request });
};
