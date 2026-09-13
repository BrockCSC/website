import { NextResponse, type NextRequest } from "next/server";
import type { SignupRecord } from "@/lib/api/types";
import { requireApprover } from "@/lib/auth/session";
import { resetUserPassword } from "@/lib/auth/keycloak-admin";
import { generateTempPassword } from "@/lib/auth/temp-password";
import { findById, update } from "@/lib/db/repository";
import { signupsTable } from "@/lib/db/schema";
import { ownsIdentities } from "@/lib/env";
import { revokeAppPasswords } from "@/lib/mail/stalwart";
import { sendSystemEmail, siteUrl } from "@/lib/mail/system-mail";
import { notAuthorized, notFound } from "@/lib/json";

const domain = () => process.env.MAIL_DOMAIN ?? "brockcsc.ca";

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
    // Mail apps sign in with app passwords, which a Keycloak reset leaves
    // alone. Revoke them so the reset cuts off every connected device too.
    // Best-effort: the Keycloak password has already changed.
    if (signup.username) {
      await revokeAppPasswords(signup.username).catch((err) => {
        console.error(
          `app password revoke failed for signup ${id}: ${err instanceof Error ? err.message : err}`,
        );
      });
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
        `Any mail apps connected to your club address (Outlook, phone mail apps) were disconnected. Once you've chosen your new password, make a new app password on the mail setup page (${siteUrl()}/admin/mail/setup) and enter it in each app.`,
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
