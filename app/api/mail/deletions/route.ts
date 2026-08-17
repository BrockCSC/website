import { NextResponse, type NextRequest } from "next/server";
import type { SignupRecord } from "@/lib/api/types";
import { update } from "@/lib/db/repository";
import { signupsTable } from "@/lib/db/schema";
import { findSignupByUserId } from "@/lib/db/signups";
import { destroyMessages } from "@/lib/mail/jmap-mail";
import { mailUser, unauthorized } from "../auth";

/**
 * Mail access is per user, so an approver cannot reach the requester's
 * mailbox. Approved deletions are carried out here instead, by the
 * requester's own token, the next time their client checks in.
 */
export const POST = async (req: NextRequest) => {
  const session = await mailUser(req);
  if (!session) return unauthorized();

  const signup = await findSignupByUserId(session.user.sub);
  const requests = signup?.mailDeletionRequests ?? [];
  const approved = requests.filter((request) => request.status === "approved");
  if (!signup || approved.length === 0) {
    return NextResponse.json({ requests, deleted: 0 });
  }

  const done = new Set<string>();
  for (const request of approved) {
    await destroyMessages(session.token, request.messageIds)
      .then(() => done.add(request.id))
      .catch(() => null);
  }
  if (done.size === 0) return NextResponse.json({ requests, deleted: 0 });

  const deletedAt = new Date().toISOString();
  const next = requests.map((request) =>
    done.has(request.id)
      ? { ...request, status: "done" as const, deletedAt }
      : request,
  );
  await update<SignupRecord>(signupsTable, signup.id, {
    mailDeletionRequests: next,
  });
  return NextResponse.json({ requests: next, deleted: done.size });
};
