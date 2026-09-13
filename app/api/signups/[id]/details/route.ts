import { NextResponse, type NextRequest } from "next/server";
import type { SignupRecord } from "@/lib/api/types";
import { requireApprover } from "@/lib/auth/session";
import { updateUser } from "@/lib/auth/keycloak-admin";
import { cleanSignupDetails } from "@/lib/signups/patch";
import { findActiveMigrationForSignup } from "@/lib/db/identity-migrations";
import { findById, toWireRecord, update } from "@/lib/db/repository";
import { signupsTable } from "@/lib/db/schema";
import { ownsIdentities } from "@/lib/env";
import { syncNameChange } from "@/lib/identity/name-change";
import { usernameBase } from "@/lib/identity/plan";
import { badJson, jsonObject, notAuthorized, notFound } from "@/lib/json";

/**
 * Edits a person's roster details (name, email, phone, student number,
 * access card). Deliberately separate from PATCH /api/signups/[id], which is
 * the approve/reject verb. Username is never accepted here — a name that
 * would change it is refused and goes through POST .../rename instead.
 */
export const PATCH = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  if (!(await requireApprover(req))) return notAuthorized();
  const { id } = await params;
  const signup = await findById<SignupRecord>(signupsTable, id);
  if (!signup) return notFound();
  if (await findActiveMigrationForSignup(id)) {
    return NextResponse.json(
      { error: "A username change is in progress; wait for it to finish." },
      { status: 409 },
    );
  }

  const body = await jsonObject<SignupRecord>(req);
  if (!body) return badJson();
  const cleaned = cleanSignupDetails(body);
  if ("error" in cleaned) {
    return NextResponse.json({ error: cleaned.error }, { status: 400 });
  }

  const { firstName, lastName, email } = cleaned.patch;
  const names = {
    firstName: firstName ?? signup.firstName ?? "",
    lastName: lastName ?? signup.lastName ?? "",
  };
  const namesChanged =
    names.firstName !== (signup.firstName ?? "") ||
    names.lastName !== (signup.lastName ?? "");
  if (
    namesChanged &&
    signup.username &&
    usernameBase(names.firstName, names.lastName) !== signup.username
  ) {
    return NextResponse.json(
      {
        error: "That name changes the username. Use Rename instead.",
        rename: true,
      },
      { status: 409 },
    );
  }
  if (ownsIdentities() && signup.keycloakUserId) {
    try {
      if (namesChanged) await syncNameChange(signup, names);
      if (email !== undefined)
        await updateUser(signup.keycloakUserId, { email });
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Keycloak could not be updated.",
        },
        { status: 422 },
      );
    }
  }

  const entity = await update<SignupRecord>(signupsTable, id, cleaned.patch);
  if (!entity) return notFound();
  return NextResponse.json(toWireRecord(entity));
};
