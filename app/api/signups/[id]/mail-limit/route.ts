import { NextResponse, type NextRequest } from "next/server";
import type { MailLimitRequest, SignupRecord } from "@/lib/api/types";
import { requireApprover } from "@/lib/auth/session";
import { findById, toWireRecord, update } from "@/lib/db/repository";
import { signupsTable } from "@/lib/db/schema";
import { badJson, jsonObject, notAuthorized, notFound } from "@/lib/json";
import { isSelfReview, selfReviewRefused } from "../review";

export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const approver = await requireApprover(req);
  if (!approver) return notAuthorized();

  const body = await jsonObject<{ action?: string }>(req);
  if (!body) return badJson();
  const { action } = body;
  if (action !== "approve" && action !== "decline") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { id } = await params;
  const signup = await findById<SignupRecord>(signupsTable, id);
  if (!signup) return notFound();
  if (isSelfReview(approver, signup.keycloakUserId))
    return selfReviewRefused("request");

  const request = signup.mailLimitRequest;
  if (request?.status !== "pending") {
    return NextResponse.json(
      { error: "No request is waiting." },
      { status: 409 },
    );
  }

  const reviewed: MailLimitRequest = {
    ...request,
    status: action === "approve" ? "approved" : "declined",
    reviewedBy: approver.email || approver.name,
    reviewedAt: new Date().toISOString(),
  };
  const updated = await update<SignupRecord>(signupsTable, id, {
    mailLimitRequest: reviewed,
    ...(action === "approve" ? { mailDailyLimit: request.requested } : {}),
  });
  if (!updated) return notFound();
  return NextResponse.json(toWireRecord(updated));
};
