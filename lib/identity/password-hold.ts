import { NextResponse } from "next/server";
import type { SignupRecord } from "@/lib/api/types";
import { findActiveMigrationForSignup } from "@/lib/db/identity-migrations";
import type { Entity } from "@/lib/db/repository";

/**
 * A rename gives the new login the password it captured at the start, and
 * deletes the old one. Until the sign-up record points at the new login, a
 * reset would only ever reach the login about to go, so it waits; after
 * that it lands on the login the member keeps.
 */
export const renameHoldsPassword = async (
  signup: Entity<SignupRecord>,
): Promise<boolean> => {
  const active = await findActiveMigrationForSignup(signup.id);
  return !!active && signup.keycloakUserId !== active.to.keycloakUserId;
};

export const renameInProgress = () =>
  NextResponse.json(
    {
      error:
        "A username change is in progress for this account. Abort it from People, or wait for it to finish, then reset the password.",
    },
    { status: 409 },
  );
