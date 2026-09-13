import { randomBytes, randomInt } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { SignupRecord } from "@/lib/api/types";
import { requireApprover } from "@/lib/auth/session";
import { resetUserPassword } from "@/lib/auth/keycloak-admin";
import { findById, update } from "@/lib/db/repository";
import { signupsTable } from "@/lib/db/schema";
import { ownsIdentities } from "@/lib/env";
import { syncMailPassword } from "@/lib/mail/password";
import { sendSystemEmail, siteUrl } from "@/lib/mail/system-mail";
import { notAuthorized, notFound } from "@/lib/json";

const domain = () => process.env.MAIL_DOMAIN ?? "brockcsc.ca";

/** No 0/O/1/l/I — an admin may need to read this out loud or retype it. */
const TEMP_PASSWORD_ALPHABET =
  "23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";

const generateTempPassword = (length = 12) =>
  Array.from(
    { length },
    () => TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)],
  ).join("");

/**
 * Sets a temporary password an approver can hand to someone directly. Always
 * non-temporary in Keycloak (see resetUserPassword) — instead this flags the
 * signup record so our own login route forces a change on next sign-in.
 */
export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  if (!(await requireApprover(req))) return notAuthorized();
  const { id } = await params;
  const signup = await findById<SignupRecord>(signupsTable, id);
  if (!signup) return notFound();
  if (!signup.keycloakUserId) {
    return NextResponse.json(
      { error: "No Keycloak account is linked to this request." },
      { status: 422 },
    );
  }

  const tempPassword = generateTempPassword();
  const rehearsed = !ownsIdentities();

  if (!rehearsed) {
    try {
      await resetUserPassword(signup.keycloakUserId, tempPassword);
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
    // The mailbox gets an unguessable throwaway, not the temp password. The
    // temp password travels in plaintext email and Stalwart can't force a
    // change, so letting it open IMAP/SMTP would dodge the forced reset for
    // good. Mail unlocks when they choose their own password in the portal.
    if (signup.username) {
      await syncMailPassword(
        signup.username,
        randomBytes(32).toString("base64url"),
      );
    }
    await update<SignupRecord>(signupsTable, id, {
      passwordResetRequired: true,
    });

    const recipients = [
      signup.email,
      signup.username ? `${signup.username}@${domain()}` : undefined,
    ].filter((address): address is string => !!address);

    await sendSystemEmail({
      to: recipients,
      subject: "Your BrockCSC password was reset",
      text: [
        `A co-president reset your BrockCSC password.`,
        ``,
        `Temporary password: ${tempPassword}`,
        ``,
        `Sign in at ${siteUrl()}/admin with your username and this password — you'll be asked to choose a new one right away.`,
        ``,
        `Your mailbox (Outlook, phone mail apps) stays locked until you've done that, then works with your new password.`,
        ``,
        `If you didn't expect this, contact a co-president.`,
      ].join("\n"),
    }).catch((err) => {
      console.error(
        `admin password-reset email failed for signup ${id}: ${err instanceof Error ? err.message : err}`,
      );
    });
  }

  return NextResponse.json({ tempPassword, rehearsed });
};
