import type { IdentityMigrationRecord } from "@/lib/api/types";
import { coPresidentsAddress, domain } from "@/lib/mail/provision";
import { sendSystemEmail, siteUrl } from "@/lib/mail/system-mail";
import { FORWARD_DAYS } from "./step-list";

const address = (localPart: string) => `${localPart}@${domain()}`;
const day = (iso?: string) => (iso ? iso.slice(0, 10) : "");

export const notifyRenameRequested = (record: IdentityMigrationRecord) =>
  sendSystemEmail({
    to: [record.from.email, address(record.from.username)],
    subject: "Your BrockCSC username is being changed",
    text: [
      `${record.requestedBy.kind === "self" ? "You" : "A co-president"} asked to change the name on your BrockCSC account from ${record.from.firstName} ${record.from.lastName} to ${record.to.firstName} ${record.to.lastName}.`,
      "",
      `That changes your username to ${record.to.username} and your club address to ${address(record.to.username)}. Everything in your mailbox is copied across and checked before anything is removed. You'll get another email when it's done.`,
      "",
      `Mail sent to ${address(record.from.username)} keeps reaching you for ${FORWARD_DAYS} days.`,
      "",
      "If you didn't ask for this, contact a co-president straight away.",
    ].join("\n"),
  });

export const notifyRenameCutover = (
  record: IdentityMigrationRecord,
  tempPassword: string | null,
) => {
  const apps = record.from.appPasswords.map((one) => one.description);
  return sendSystemEmail({
    to: [record.to.email, address(record.to.username)],
    subject: `You're now ${record.to.username} on BrockCSC`,
    text: [
      `Your BrockCSC account has moved to the username ${record.to.username}. Your club address is now ${address(record.to.username)}.`,
      "",
      `Mail sent to ${address(record.from.username)} still reaches you until ${day(record.forwardUntil)}. Senders get an automatic reply asking them to update their contacts, and each of those messages is tagged "[Sent to retired address]".`,
      "",
      apps.length
        ? `These app passwords have stopped working and need to be created again: ${apps.join(", ")}.`
        : "You had no app passwords, so there is nothing to recreate.",
      "",
      `Mail apps need to be set up again with the new address. On Apple devices, remove the old "Brock CSC Mail" profile before installing the new one from ${siteUrl()}/admin/mail/setup.`,
      "",
      tempPassword
        ? `Temporary password: ${tempPassword}\n\nSign in at ${siteUrl()}/admin as ${record.to.username} with it — you'll be asked to choose a new one right away.`
        : `If you weren't signed back in automatically, sign in at ${siteUrl()}/admin as ${record.to.username} with your usual password.`,
    ].join("\n"),
  });
};

export const notifyRenameDone = (record: IdentityMigrationRecord) =>
  sendSystemEmail({
    to: [record.to.email, address(record.to.username)],
    subject: "Your BrockCSC username change is complete",
    text: [
      "Everything checked out: your old mailbox has been retired and your old login deleted.",
      "",
      `You're ${record.to.username}, at ${address(record.to.username)}. Mail to ${address(record.from.username)} keeps forwarding until ${day(record.forwardUntil)}; after that the old address stops working, and it is never given to anyone else.`,
    ].join("\n"),
  });

export const notifyRenameFailed = (
  record: IdentityMigrationRecord,
  step: string,
  error: string,
) =>
  sendSystemEmail({
    to: [
      record.to.email,
      address(record.cutOverAt ? record.to.username : record.from.username),
      coPresidentsAddress(),
    ],
    subject: `Username change for ${record.from.username} needs attention`,
    text: [
      `The change from ${record.from.username} to ${record.to.username} stopped at the step "${step}":`,
      "",
      error,
      "",
      record.cutOverAt
        ? `The account is already on ${record.to.username}. Nothing has been deleted: the old mailbox stays intact until the check passes. A co-president can resume the change from People once the cause is fixed.`
        : "Nothing has changed for the member yet. A co-president can resume or abort the change from People.",
    ].join("\n"),
  });
