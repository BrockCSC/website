import { NextResponse, type NextRequest } from "next/server";
import type { SignupRecord } from "@/lib/api/types";
import { update } from "@/lib/db/repository";
import { signupsTable } from "@/lib/db/schema";
import { findSignupByUserId } from "@/lib/db/signups";
import { badJson, jsonObject } from "@/lib/json";
import { allowanceFor, dailyLimitFor, MAX_DAILY_LIMIT } from "@/lib/mail/limit";
import { mailUser, unauthorized } from "../auth";

export const GET = async (req: NextRequest) => {
  const session = await mailUser(req);
  if (!session) return unauthorized();

  const signup = await findSignupByUserId(session.user.sub);
  try {
    return NextResponse.json(await allowanceFor(session.token, signup));
  } catch {
    return NextResponse.json(
      { error: "Could not reach the mail server" },
      { status: 502 },
    );
  }
};

/** Records a request only: raising a limit is an approver's call. */
export const POST = async (req: NextRequest) => {
  const session = await mailUser(req);
  if (!session) return unauthorized();

  const body = await jsonObject<{ requested?: unknown; reason?: unknown }>(req);
  if (!body) return badJson();

  const signup = await findSignupByUserId(session.user.sub);
  if (!signup) {
    return NextResponse.json({ error: "No linked account" }, { status: 404 });
  }
  if (signup.mailLimitRequest?.status === "pending") {
    return NextResponse.json(
      { error: "A request is already waiting for a co-president." },
      { status: 409 },
    );
  }

  const current = dailyLimitFor(signup);
  const requested = Math.floor(Number(body.requested));
  if (
    !Number.isFinite(requested) ||
    requested <= current ||
    requested > MAX_DAILY_LIMIT
  ) {
    return NextResponse.json(
      {
        error: `Ask for between ${current + 1} and ${MAX_DAILY_LIMIT} messages a day.`,
      },
      { status: 400 },
    );
  }

  await update<SignupRecord>(signupsTable, signup.id, {
    mailLimitRequest: {
      requested,
      reason:
        typeof body.reason === "string" && body.reason.trim()
          ? body.reason.trim().slice(0, 500)
          : undefined,
      requestedAt: new Date().toISOString(),
      status: "pending",
    },
  });
  return NextResponse.json({ requested });
};
