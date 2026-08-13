import { NextResponse, type NextRequest } from "next/server";
import type { SignupRecord } from "@/lib/api/types";
import { isValidInviteCode } from "@/lib/auth/invite-code";
import {
  createDisabledUser,
  deleteUser,
  findUserByUsername,
  usernameFor,
} from "@/lib/auth/keycloak-admin";
import { create } from "@/lib/db/repository";
import { signupsTable } from "@/lib/db/schema";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const badRequest = (error: string) =>
  NextResponse.json({ error }, { status: 400 });

export const POST = async (req: NextRequest) => {
  const body = (await req.json()) as Record<string, string | undefined>;
  const inviteCode = body.inviteCode?.trim() ?? "";
  const firstName = body.firstName?.trim() ?? "";
  const lastName = body.lastName?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  const phone = body.phone?.trim() ?? "";
  const password = body.password ?? "";

  if (!isValidInviteCode(inviteCode)) {
    return NextResponse.json(
      { error: "That invite code is not valid." },
      { status: 403 },
    );
  }
  if (!firstName || !lastName) {
    return badRequest("First and last name are required.");
  }
  if (!EMAIL_PATTERN.test(email)) {
    return badRequest("Enter a valid email address.");
  }
  if (password.length < 8) {
    return badRequest("Password must be at least 8 characters.");
  }
  if (password !== body.confirmPassword) {
    return badRequest("Passwords do not match.");
  }

  const username = usernameFor(firstName, lastName);
  if (await findUserByUsername(username)) {
    return NextResponse.json(
      { error: "That username is already taken." },
      { status: 409 },
    );
  }

  const keycloakUserId = await createDisabledUser({
    username,
    email,
    firstName,
    lastName,
    password,
    attributes: phone ? { phone: [phone] } : undefined,
  });

  try {
    await create<SignupRecord>(signupsTable, {
      firstName,
      lastName,
      username,
      email,
      phone: phone || undefined,
      keycloakUserId,
      status: "pending",
      submittedAt: new Date().toISOString(),
    });
  } catch (err) {
    // Don't orphan a Keycloak account we have no signup record for.
    await deleteUser(keycloakUserId);
    throw err;
  }

  return new NextResponse(null, { status: 201 });
};
