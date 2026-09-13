/** Transactional email (password resets, temp passwords) sent by the app itself. */

import { adminAccess } from "./access";
import { sendMessage } from "./jmap-mail";
import { domain } from "./provision";
import { createApprovedSender } from "./oci-senders";
import { createMailbox, listUsers, localPartTaken } from "./stalwart";

const systemSenderLocalPart = () =>
  process.env.SYSTEM_MAIL_SENDER ?? "security";

/**
 * Links in these emails come from config, never the request's Host header —
 * otherwise a forged Host on "forgot password" would mail a reset link
 * pointing at an attacker's site.
 */
export const siteUrl = () =>
  (process.env.MAIL_SITE_URL || "https://brockcsc.ca").replace(/\/$/, "");

/** Per process: set once OCI has accepted the sender, so later sends skip it. */
let approvedSender = false;

/**
 * Idempotent, like provisionMailbox: creates the sender mailbox on first use
 * if it isn't there yet. No password is ever set on it — nothing needs to log
 * in as it, since sending goes through adminAccess (the Stalwart admin
 * credential, acting as this account), not the mailbox's own credentials.
 */
const ensureSystemSender = async (): Promise<string> => {
  const localPart = systemSenderLocalPart();
  const address = `${localPart}@${domain()}`;
  if (!(await localPartTaken(localPart))) {
    await createMailbox({
      localPart,
      displayName: "BrockCSC Security",
      domain: domain(),
    });
  }
  // Retried until it succeeds rather than only right after creating the
  // mailbox: one failure there would otherwise leave outside addresses
  // bouncing for good. Club mailboxes are delivered locally either way, so a
  // failure here warns instead of blocking the send.
  if (!approvedSender) {
    try {
      await createApprovedSender(address);
      approvedSender = true;
    } catch (err) {
      console.warn(
        `could not register ${address} as an OCI approved sender; mail to outside addresses may bounce: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  const user = (await listUsers()).find((u) => u.name === localPart);
  if (!user) throw new Error(`Could not provision the ${address} mailbox.`);
  return user.id;
};

export const sendSystemEmail = async (msg: {
  to: string[];
  subject: string;
  text: string;
}): Promise<void> => {
  const to = [...new Set(msg.to.filter(Boolean))];
  if (!to.length) return;
  const accountId = await ensureSystemSender();
  await sendMessage(adminAccess(accountId), {
    to,
    subject: msg.subject,
    text: msg.text,
  });
};
