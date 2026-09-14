import { NextResponse, type NextRequest } from "next/server";
import type { SignupRecord } from "@/lib/api/types";
import { requireApprover } from "@/lib/auth/session";
import { updateUser } from "@/lib/auth/keycloak-admin";
import { cleanSignupDetails } from "@/lib/signups/patch";
import { findById, toWireRecord, update } from "@/lib/db/repository";
import { signupsTable } from "@/lib/db/schema";
import { ownsIdentities } from "@/lib/env";
import { badJson, jsonObject, notAuthorized, notFound } from "@/lib/json";
import { followPersonalEmail } from "@/lib/mail/personal-forwarding";

/**
 * Edits a person's roster details (name, email, phone, student number,
 * access card). Deliberately separate from PATCH /api/signups/[id], which is
 * the approve/reject verb. Username is never accepted here — it drives
 * mailbox provisioning and must go through its own dedicated flow.
 */
export const PATCH = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  if (!(await requireApprover(req))) return notAuthorized();
  const { id } = await params;
  const signup = await findById<SignupRecord>(signupsTable, id);
  if (!signup) return notFound();

  const body = await jsonObject<SignupRecord>(req);
  if (!body) return badJson();
  const cleaned = cleanSignupDetails(body);
  if ("error" in cleaned) {
    return NextResponse.json({ error: cleaned.error }, { status: 400 });
  }

  const { firstName, lastName, email } = cleaned.patch;
  if (
    ownsIdentities() &&
    signup.keycloakUserId &&
    (firstName !== undefined || lastName !== undefined || email !== undefined)
  ) {
    try {
      await updateUser(signup.keycloakUserId, { firstName, lastName, email });
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
  if (email !== undefined && email !== signup.email) {
    await followPersonalEmail(entity);
  }
  return NextResponse.json(toWireRecord(entity));
};
