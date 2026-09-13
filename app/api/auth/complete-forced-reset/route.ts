import { NextResponse, type NextRequest } from "next/server";
import type { SignupRecord } from "@/lib/api/types";
import { resetUserPassword } from "@/lib/auth/keycloak-admin";
import { verifyForcedResetToken } from "@/lib/auth/session";
import { findSignupByUserId } from "@/lib/db/signups";
import { update } from "@/lib/db/repository";
import { signupsTable } from "@/lib/db/schema";
import { ownsIdentities } from "@/lib/env";
import { syncMailPassword } from "@/lib/mail/password";
import { badJson, jsonObject } from "@/lib/json";
import { rateLimit } from "@/lib/rate-limit";
import { MIN_PASSWORD_LENGTH } from "@/lib/signups/validation";

export const POST = async (req: NextRequest) => {
  const limited = rateLimit(req, "complete-forced-reset", 10, 60 * 60 * 1000);
  if (limited) return limited;

  const body = await jsonObject<{ resetToken?: string; newPassword?: string }>(
    req,
  );
  if (!body) return badJson();
  const { resetToken, newPassword } = body;
  if (!resetToken || !newPassword) return badJson();
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      {
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      },
      { status: 400 },
    );
  }

  const claims = verifyForcedResetToken(resetToken);
  // The token lives 10 minutes, but it only works while a reset is still
  // pending: once they've chosen a password, replaying it does nothing.
  const signup = claims ? await findSignupByUserId(claims.sub) : null;
  if (!claims || !signup?.passwordResetRequired || !ownsIdentities()) {
    return NextResponse.json(
      { error: "That sign-in has expired. Sign in again to continue." },
      { status: 400 },
    );
  }

  try {
    await resetUserPassword(claims.sub, newPassword);
  } catch {
    return NextResponse.json(
      { error: "Could not update your password right now. Try again." },
      { status: 502 },
    );
  }
  if (signup.username) await syncMailPassword(signup.username, newPassword);
  await update<SignupRecord>(signupsTable, signup.id, {
    passwordResetRequired: false,
  });

  return NextResponse.json({ success: true });
};
