import { usersWithRealmRole } from "@/lib/auth/keycloak-admin";
import { dottedAliasFor } from "@/lib/auth/username";
import { createApprovedSender, deleteApprovedSender } from "./oci-senders";
import {
  clearReadOnly,
  createMailbox,
  localPartTaken,
  makeReadOnly,
  setExpungeAllowed,
  setGroupMembers,
} from "./stalwart";

const domain = () => process.env.MAIL_DOMAIN ?? "brockcsc.ca";

const protectedMailboxes = (): string[] =>
  (process.env.PROTECTED_MAIL_USERS ?? "alaqmargandhi")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

export const isProtectedMailbox = (username: string): boolean =>
  protectedMailboxes().includes(username);

const approvers = async (): Promise<string[]> => {
  const holders = await usersWithRealmRole("co-president");
  return [
    ...new Set([
      ...holders.map((holder) => holder.username),
      ...protectedMailboxes(),
    ]),
  ];
};

export const syncAdminGroup = async (): Promise<void> => {
  await setGroupMembers(
    process.env.ADMIN_MAIL_GROUP ?? "admin",
    await approvers(),
  );
};

/** Keeps permanent deletion over IMAP to the people who may approve it. */
export const syncExpungeRights = async (): Promise<void> => {
  await setExpungeAllowed(await approvers());
};

/** Idempotent, so a failed approval can be retried. */
export const provisionMailbox = async (exec: {
  username: string;
  firstName: string;
  lastName: string;
}): Promise<void> => {
  if (!(await localPartTaken(exec.username))) {
    await createMailbox({
      localPart: exec.username,
      displayName: [exec.firstName, exec.lastName].filter(Boolean).join(" "),
      alias: dottedAliasFor(exec.firstName, exec.lastName) || undefined,
      domain: domain(),
    });
  }
  await clearReadOnly(exec.username);
  await syncExpungeRights();
  await createApprovedSender(`${exec.username}@${domain()}`);
};

export const makeMailboxReadOnly = async (username: string): Promise<void> => {
  if (isProtectedMailbox(username)) return;
  await makeReadOnly(username);
  await deleteApprovedSender(`${username}@${domain()}`);
};
