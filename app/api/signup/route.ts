import { randomInt } from "node:crypto";
import anyAscii from "any-ascii";
import { NextResponse, type NextRequest } from "next/server";
import type { SignupRecord } from "@/lib/api/types";
import { isValidInviteCode } from "@/lib/auth/invite-code";
import {
  allocateUsername,
  createDisabledUser,
  deleteUser,
} from "@/lib/auth/keycloak-admin";
import { fold, usernameFor } from "@/lib/auth/username";
import { create, findAll } from "@/lib/db/repository";
import { rateLimit } from "@/lib/rate-limit";
import { badJson, jsonObject } from "@/lib/json";
import { signupsTable } from "@/lib/db/schema";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BROCK_EMAIL_PATTERN = /@(?:[a-z0-9-]+\.)*brocku\.ca$/i;
const STUDENT_ID_PATTERN = /^\d{6,10}$/;
const MAX_NAME = 60;
const MAX_EMAIL = 200;
const MAX_PHONE = 30;

const badRequest = (error: string) =>
  NextResponse.json({ error }, { status: 400 });

const conflict = (error: string) =>
  NextResponse.json({ error }, { status: 409 });

/** No vowels or look-alike characters, so it survives being read aloud. */
const CONFIRMATION_ALPHABET = "23456789BCDFGHJKLMNPQRSTVWXZ";

const confirmationCode = () =>
  Array.from(
    { length: 6 },
    () => CONFIRMATION_ALPHABET[randomInt(CONFIRMATION_ALPHABET.length)],
  ).join("");

export const POST = async (req: NextRequest) => {
  // Every accepted request creates a Keycloak account, so cap the burst.
  const flooding = rateLimit(req, "signup", 20, 60 * 60 * 1000);
  if (flooding) return flooding;

  const body = await jsonObject<Record<string, string | undefined>>(req);
  if (!body) return badJson();
  const inviteCode = body.inviteCode?.trim() ?? "";
  const firstName = body.firstName?.trim() ?? "";
  const lastName = body.lastName?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  const phone = body.phone?.trim() ?? "";
  const studentId = body.studentId?.trim() ?? "";
  const isFormerExec = String(body.isFormerExec) === "true";
  const password = body.password ?? "";

  if (!isValidInviteCode(inviteCode)) {
    // A wrong code is the only signal a guesser gets; make guesses expensive.
    return (
      rateLimit(req, "invite-code", 10, 60 * 60 * 1000) ??
      NextResponse.json(
        { error: "That invite code is not valid." },
        { status: 403 },
      )
    );
  }
  if (!firstName || !lastName) {
    return badRequest("First and last name are required.");
  }
  if (firstName.length > MAX_NAME || lastName.length > MAX_NAME) {
    return badRequest("That name is too long.");
  }
  if (email.length > MAX_EMAIL || !EMAIL_PATTERN.test(email)) {
    return badRequest("Enter a valid email address.");
  }
  if (phone.length > MAX_PHONE) {
    return badRequest("That phone number is too long.");
  }
  // Current execs verify with Brock credentials; alumni no longer have them.
  if (!isFormerExec) {
    if (!BROCK_EMAIL_PATTERN.test(email)) {
      return badRequest(
        "Use your @brocku.ca email, or tick that you are a former executive.",
      );
    }
    if (!STUDENT_ID_PATTERN.test(studentId)) {
      return badRequest("Enter your student number, digits only.");
    }
  } else if (studentId && !STUDENT_ID_PATTERN.test(studentId)) {
    return badRequest("That student number does not look right.");
  }
  if (password.length < 8) {
    return badRequest("Password must be at least 8 characters.");
  }
  if (password !== body.confirmPassword) {
    return badRequest("Passwords do not match.");
  }

  // A second request would strand a second account; say what to do instead.
  const existing = (await findAll<SignupRecord>(signupsTable)).find(
    (record) =>
      record.status !== "rejected" &&
      record.email?.toLowerCase() === email.toLowerCase(),
  );
  if (existing) {
    return conflict(
      existing.status === "pending"
        ? "A request from that email is already waiting for a co-president. You do not need to send another one — ask them to approve it."
        : "That email already has an account. Sign in with it, or ask a co-president for help.",
    );
  }

  const base =
    usernameFor(firstName, lastName) ||
    fold(anyAscii(`${firstName}${lastName}`));
  if (!base) {
    return badRequest("We could not build a username from that name.");
  }
  const username = await allocateUsername(base);

  let keycloakUserId: string;
  try {
    keycloakUserId = await createDisabledUser({
      username,
      email,
      firstName,
      lastName,
      password,
      attributes: phone ? { phone: [phone] } : undefined,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("already taken")) {
      return conflict(
        "An account already exists for that name or email. Sign in if it is yours, or ask a co-president to check.",
      );
    }
    throw err;
  }

  const confirmation = confirmationCode();

  try {
    await create<SignupRecord>(signupsTable, {
      firstName,
      lastName,
      username,
      email,
      phone: phone || undefined,
      studentId: studentId || undefined,
      isFormerExec,
      keycloakUserId,
      confirmationCode: confirmation,
      status: "pending",
      submittedAt: new Date().toISOString(),
    });
  } catch (err) {
    // Don't orphan a Keycloak account we have no signup record for.
    await deleteUser(keycloakUserId);
    throw err;
  }

  return NextResponse.json(
    {
      confirmationCode: confirmation,
      username,
      // Alumni are approved without a mailbox, so promise one only to execs.
      mailbox: isFormerExec
        ? undefined
        : `${username}@${process.env.MAIL_DOMAIN ?? "brockcsc.ca"}`,
    },
    { status: 201 },
  );
};
