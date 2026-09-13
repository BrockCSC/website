import { NextResponse, type NextRequest } from "next/server";
import type { SignupRecord } from "@/lib/api/types";
import { requireApprover } from "@/lib/auth/session";
import { generateTempPassword } from "@/lib/auth/temp-password";
import { findById } from "@/lib/db/repository";
import { signupsTable } from "@/lib/db/schema";
import { startMigration } from "@/lib/identity/migration";
import { isRefusal, planRename } from "@/lib/identity/plan";
import { PreflightRequired } from "@/lib/identity/preflight";
import { MAX_NAME } from "@/lib/signups/patch";
import { badJson, jsonObject, notAuthorized, notFound } from "@/lib/json";
import { rateLimit } from "@/lib/rate-limit";
import { isSelfReview, selfReviewRefused } from "../review";

/**
 * An approver renaming someone. Without `confirm` this only previews; with
 * it, the new login gets a temporary password shown once and emailed, the
 * same as an admin password reset.
 */
export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const approver = await requireApprover(req);
  if (!approver) return notAuthorized();
  const { id } = await params;
  const signup = await findById<SignupRecord>(signupsTable, id);
  if (!signup) return notFound();
  if (isSelfReview(approver, signup.keycloakUserId)) {
    return selfReviewRefused("record");
  }

  const body = await jsonObject<{
    firstName?: unknown;
    lastName?: unknown;
    confirm?: unknown;
  }>(req);
  if (!body) return badJson();
  const { firstName, lastName } = body;
  if (
    typeof firstName !== "string" ||
    typeof lastName !== "string" ||
    !firstName.trim() ||
    !lastName.trim() ||
    firstName.length > MAX_NAME ||
    lastName.length > MAX_NAME
  ) {
    return NextResponse.json(
      { error: "First and last name are required." },
      { status: 400 },
    );
  }

  const plan = await planRename(
    signup,
    { firstName, lastName },
    { sub: approver.sub, kind: "approver" },
  );
  if (isRefusal(plan)) {
    return NextResponse.json({ error: plan.error }, { status: plan.status });
  }
  const rehearsal = plan.record.mode === "rehearsal";
  if (body.confirm !== true) {
    return NextResponse.json({
      preview: plan.preview,
      to: plan.record.to.username,
      rehearsal,
    });
  }

  const limited = rateLimit(req, "rename", 2, 24 * 60 * 60_000, signup.id);
  if (limited) return limited;
  const tempPassword = generateTempPassword();
  try {
    const record = await startMigration(plan, tempPassword);
    return NextResponse.json(
      { migrationId: record.id, tempPassword, rehearsed: rehearsal },
      { status: 202 },
    );
  } catch (err) {
    if (err instanceof PreflightRequired) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
};
