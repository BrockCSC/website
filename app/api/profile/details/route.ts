import { NextResponse, type NextRequest } from "next/server";
import type { SignupRecord } from "@/lib/api/types";
import { updateUser } from "@/lib/auth/keycloak-admin";
import { confirmCurrentPassword } from "@/lib/auth/reauth";
import { requireMember } from "@/lib/auth/session";
import {
  findActiveMigrationForSignup,
  findActiveMigrationForSub,
} from "@/lib/db/identity-migrations";
import { findAll, update } from "@/lib/db/repository";
import { signupsTable } from "@/lib/db/schema";
import { findSignupByUserId } from "@/lib/db/signups";
import { ownsIdentities } from "@/lib/env";
import { syncExecName, syncNameChange } from "@/lib/identity/name-change";
import { isRefusal, planRename, usernameChanges } from "@/lib/identity/plan";
import { domain } from "@/lib/mail/provision";
import { sendSystemEmail } from "@/lib/mail/system-mail";
import { cleanMemberDetails } from "@/lib/signups/patch";
import { badJson, jsonObject, notAuthorized, notFound } from "@/lib/json";

const conflict = (error: string) =>
  NextResponse.json({ error }, { status: 409 });

const detailsOf = (signup: SignupRecord) => ({
  firstName: signup.firstName ?? "",
  lastName: signup.lastName ?? "",
  email: signup.email ?? "",
  studentId: signup.studentId ?? "",
  accessCardId: signup.accessCardId ?? "",
  username: signup.username ?? "",
  address: signup.username ? `${signup.username}@${domain()}` : "",
  previousUsernames: signup.previousUsernames ?? [],
  passwordResetRequired: signup.passwordResetRequired === true,
});

/** After cut-over the old sub no longer finds a sign-up, but it still has a migration to follow. */
export const GET = async (req: NextRequest) => {
  const user = await requireMember(req);
  if (!user) return notAuthorized();
  const signup = await findSignupByUserId(user.sub);
  const migration = signup
    ? await findActiveMigrationForSignup(signup.id)
    : await findActiveMigrationForSub(user.sub);
  return NextResponse.json({
    ...(signup ? detailsOf(signup) : {}),
    identitiesEditable: ownsIdentities(),
    pendingMigrationId: migration?.id ?? null,
  });
};

const emailTaken = async (email: string, ownId: string) => {
  const wanted = email.toLowerCase();
  const d = domain();
  return (await findAll<SignupRecord>(signupsTable)).some(
    (other) =>
      other.id !== ownId &&
      other.status !== "rejected" &&
      (other.email?.toLowerCase() === wanted ||
        (other.username && `${other.username}@${d}`.toLowerCase() === wanted)),
  );
};

export const PATCH = async (req: NextRequest) => {
  const user = await requireMember(req);
  if (!user) return notAuthorized();
  const signup = await findSignupByUserId(user.sub);
  if (!signup) return notFound();
  if (signup.status !== "approved") {
    return conflict("Only an approved account can edit its details.");
  }
  const active = await findActiveMigrationForSignup(signup.id);
  if (active) {
    return NextResponse.json(
      {
        error: "A username change is in progress; wait for it to finish.",
        migrationId: active.id,
      },
      { status: 409 },
    );
  }

  const body = await jsonObject<Record<string, unknown>>(req);
  if (!body) return badJson();
  const cleaned = cleanMemberDetails(body);
  if ("error" in cleaned) {
    return NextResponse.json({ error: cleaned.error }, { status: 400 });
  }
  const changed = Object.fromEntries(
    Object.entries(cleaned.patch).filter(
      ([key, value]) =>
        value !== undefined &&
        value !== (signup[key as keyof SignupRecord] ?? ""),
    ),
  ) as Partial<SignupRecord>;
  if (!Object.keys(changed).length) {
    return NextResponse.json(detailsOf(signup));
  }

  const namesChanged =
    changed.firstName !== undefined || changed.lastName !== undefined;
  const emailChanged = changed.email !== undefined;
  if (namesChanged || emailChanged) {
    if (signup.passwordResetRequired) {
      return conflict(
        "Choose your own password first, then edit your details.",
      );
    }
    const password = body.currentPassword;
    if (typeof password !== "string" || !password) {
      return NextResponse.json(
        { error: "Enter your current password to change your name or email." },
        { status: 401 },
      );
    }
    const refused = await confirmCurrentPassword(req, user, signup, password);
    if (refused) return refused;
  }

  const names = {
    firstName: changed.firstName ?? signup.firstName ?? "",
    lastName: changed.lastName ?? signup.lastName ?? "",
  };
  if (namesChanged && usernameChanges(signup, names)) {
    const plan = await planRename(signup, names, {
      sub: user.sub,
      kind: "self",
    });
    if (isRefusal(plan)) {
      return NextResponse.json({ error: plan.error }, { status: plan.status });
    }
    // Nothing is written: the browser shows the consequences and asks again.
    return NextResponse.json(
      {
        rename: true,
        preview: plan.preview,
        to: plan.record.to.username,
        rehearsal: plan.record.mode === "rehearsal",
      },
      { status: 409 },
    );
  }

  if (emailChanged && (await emailTaken(changed.email!, signup.id))) {
    return conflict("That email already belongs to another account.");
  }

  try {
    if (ownsIdentities() && emailChanged && signup.keycloakUserId) {
      await updateUser(signup.keycloakUserId, { email: changed.email });
    }
    if (ownsIdentities() && namesChanged) await syncNameChange(signup, names);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Keycloak could not be updated.",
      },
      { status: 422 },
    );
  }
  if (namesChanged) await syncExecName(signup, names);
  const saved = await update<SignupRecord>(signupsTable, signup.id, changed);
  if (!saved) return notFound();

  // Only where Keycloak was actually changed: elsewhere the addresses are
  // real copies of prod and the notice would be both false and spoofable.
  if (emailChanged && ownsIdentities()) {
    void sendSystemEmail({
      to: [
        signup.email ?? "",
        changed.email!,
        signup.username ? `${signup.username}@${domain()}` : "",
      ],
      subject: "Your BrockCSC contact email was changed",
      text: [
        `The personal email on your BrockCSC account was changed from ${signup.email || "(none)"} to ${changed.email}.`,
        "",
        "Password reset links and notices now go to the new address.",
        "",
        "If this wasn't you, contact a co-president straight away.",
      ].join("\n"),
    }).catch((err) => {
      console.error(
        `email-change notice failed for signup ${signup.id}: ${err instanceof Error ? err.message : err}`,
      );
    });
  }
  return NextResponse.json(detailsOf(saved));
};
