import { randomBytes, createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { PasswordResetRecord, SignupRecord } from "@/lib/api/types";
import type { Entity } from "@/lib/db/repository";
import { findSignupByEmail } from "@/lib/db/signups";
import { create } from "@/lib/db/repository";
import { passwordResetsTable } from "@/lib/db/schema";
import { ownsIdentities } from "@/lib/env";
import { sendSystemEmail, siteUrl } from "@/lib/mail/system-mail";
import { badJson, jsonObject } from "@/lib/json";
import { rateLimit } from "@/lib/rate-limit";

const domain = () => process.env.MAIL_DOMAIN ?? "brockcsc.ca";
const RESET_TTL_MS = 30 * 60 * 1000;

/**
 * Same answer whether or not the email matched an account: an unauthenticated
 * endpoint that confirmed existence would let anyone enumerate members.
 */
const genericResponse = () =>
  NextResponse.json({
    message:
      "If that email matches an account, we've sent password reset instructions to it.",
  });

const sendResetLink = async (signup: Entity<SignupRecord>) => {
  const rawToken = randomBytes(32).toString("base64url");
  await create<PasswordResetRecord>(passwordResetsTable, {
    signupId: signup.id,
    tokenHash: createHash("sha256").update(rawToken).digest("hex"),
    expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(),
  });

  await sendSystemEmail({
    to: [signup.email ?? "", `${signup.username}@${domain()}`],
    subject: "Reset your BrockCSC password",
    text: [
      "Someone (hopefully you) asked to reset the password on your BrockCSC account.",
      "",
      `Set a new password here: ${siteUrl()}/reset-password?token=${rawToken}`,
      "",
      "This link works once and expires in 30 minutes. If you didn't ask for this, ignore it — your password hasn't changed.",
    ].join("\n"),
  });
};

export const POST = async (req: NextRequest) => {
  const limited = rateLimit(req, "forgot-password", 5, 60 * 60 * 1000);
  if (limited) return limited;

  const body = await jsonObject<{ email?: string }>(req);
  if (!body) return badJson();
  const email = body.email?.trim();
  if (!email) return genericResponse();

  const signup = await findSignupByEmail(email);
  if (
    !signup ||
    signup.status !== "approved" ||
    !signup.keycloakUserId ||
    !signup.username
  ) {
    return genericResponse();
  }

  // Caps reset emails per account, separately from the per-IP cap, so
  // rotating IPs can't flood one inbox. Its 429 is never returned: that
  // would confirm the account exists.
  const accountLimited = rateLimit(
    req,
    "forgot-password-account",
    3,
    60 * 60 * 1000,
    signup.id,
  );
  if (accountLimited || !ownsIdentities()) return genericResponse();

  // Not awaited: waiting on the insert and the mail send would make a match
  // measurably slower than a miss, leaking the same thing the generic
  // response hides. The app runs as a long-lived Node server, so it finishes.
  void sendResetLink(signup).catch((err) => {
    console.error(
      `forgot-password email failed for signup ${signup.id}: ${err instanceof Error ? err.message : err}`,
    );
  });

  return genericResponse();
};
