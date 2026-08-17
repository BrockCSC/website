import { NextResponse, type NextRequest } from "next/server";
import type { SignupRecord } from "@/lib/api/types";
import { requireApprover } from "@/lib/auth/session";
import { findById, toWireRecord, update } from "@/lib/db/repository";
import { signupsTable } from "@/lib/db/schema";
import { badJson, jsonObject, notAuthorized, notFound } from "@/lib/json";

export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const approver = await requireApprover(req);
  if (!approver) return notAuthorized();

  const body = await jsonObject<{ action?: string; requestId?: string }>(req);
  if (!body) return badJson();
  const { action, requestId } = body;
  if (action !== "approve" && action !== "decline") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { id } = await params;
  const signup = await findById<SignupRecord>(signupsTable, id);
  if (!signup) return notFound();
  if (signup.keycloakUserId === approver.sub) {
    return NextResponse.json(
      { error: "Another co-president has to review your own request." },
      { status: 409 },
    );
  }

  const requests = signup.mailDeletionRequests ?? [];
  const target = requests.find(
    (request) => request.id === requestId && request.status === "pending",
  );
  if (!target) {
    return NextResponse.json(
      { error: "No request is waiting." },
      { status: 409 },
    );
  }

  const reviewed = {
    ...target,
    status:
      action === "approve" ? ("approved" as const) : ("declined" as const),
    reviewedBy: approver.email || approver.name,
    reviewedAt: new Date().toISOString(),
  };
  const updated = await update<SignupRecord>(signupsTable, id, {
    mailDeletionRequests: requests.map((request) =>
      request.id === target.id ? reviewed : request,
    ),
  });
  if (!updated) return notFound();
  return NextResponse.json(toWireRecord(updated));
};
