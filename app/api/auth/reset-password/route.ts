import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { resetUserPassword } from "@/lib/auth/keycloak-admin";
import { findValidResetToken } from "@/lib/db/password-resets";
import { findById, remove, update } from "@/lib/db/repository";
import type { SignupRecord } from "@/lib/api/types";
import { passwordResetsTable, signupsTable } from "@/lib/db/schema";
import { ownsIdentities } from "@/lib/env";
import {
  renameHoldsPassword,
  renameInProgress,
} from "@/lib/identity/password-hold";
import { badJson, jsonObject } from "@/lib/json";
import { rateLimit } from "@/lib/rate-limit";
import { MIN_PASSWORD_LENGTH } from "@/lib/signups/validation";

const INVALID = () =>
  NextResponse.json(
    { error: "That reset link is invalid or has expired." },
    { status: 400 },
  );

export const POST = async (req: NextRequest) => {
  const limited = rateLimit(req, "reset-password", 10, 60 * 60 * 1000);
  if (limited) return limited;

  const body = await jsonObject<{ token?: string; password?: string }>(req);
  if (!body) return badJson();
  const { token, password } = body;
  if (!token || !password) return badJson();
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const record = await findValidResetToken(tokenHash);
  if (!record) return INVALID();

  const signup = await findById<SignupRecord>(signupsTable, record.signupId);
  if (!signup?.keycloakUserId || !signup.username) return INVALID();
  // The link stays valid: nothing was spent, and it works once the rename is through.
  if (await renameHoldsPassword(signup)) return renameInProgress();

  if (ownsIdentities()) {
    try {
      await resetUserPassword(signup.keycloakUserId, password);
    } catch {
      return NextResponse.json(
        { error: "Could not update your password right now. Try again." },
        { status: 502 },
      );
    }
  }
  // Spent only once the password actually changed, so a Keycloak hiccup
  // leaves the link usable for the retry the error message invites.
  await remove(passwordResetsTable, record.id);
  // A password they chose through their own inbox satisfies a pending
  // admin-issued reset too; otherwise their next sign-in would demand another.
  if (signup.passwordResetRequired && ownsIdentities()) {
    await update<SignupRecord>(signupsTable, signup.id, {
      passwordResetRequired: false,
    });
  }

  return NextResponse.json({ success: true });
};
