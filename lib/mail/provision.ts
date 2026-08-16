import { usersWithRealmRole } from "@/lib/auth/keycloak-admin";
import { dottedAliasFor } from "@/lib/auth/username";
import { createApprovedSender, deleteApprovedSender } from "./oci-senders";
import {
  createMailbox,
  localPartTaken,
  makeReadOnly,
  setGroupMembers,
} from "./stalwart";

const domain = () => process.env.MAIL_DOMAIN ?? "brockcsc.ca";

/** Service accounts. Defaulted rather than required so the guard survives a
 * missing env var, and checked here so no caller can route around it. */
const protectedMailboxes = (): string[] =>
  (process.env.PROTECTED_MAIL_USERS ?? "alaqmargandhi")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

export const isProtectedMailbox = (username: string): boolean =>
  protectedMailboxes().includes(username);

/** admin@ has no mailbox of its own; it fans out to whoever currently holds
 * co-president, plus the protected owner accounts. Recomputed from Keycloak
 * rather than patched per change, so it cannot drift. */
export const syncAdminGroup = async (): Promise<void> => {
  const holders = await usersWithRealmRole("co-president");
  await setGroupMembers(process.env.ADMIN_MAIL_GROUP ?? "admin", [
    ...new Set([
      ...holders.map((holder) => holder.username),
      ...protectedMailboxes(),
    ]),
  ]);
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
  await createApprovedSender(`${exec.username}@${domain()}`);
};

/** Alumni keep a readable inbox but cannot send, and drop off the OCI quota. */
export const makeMailboxReadOnly = async (username: string): Promise<void> => {
  if (isProtectedMailbox(username)) return;
  await makeReadOnly(username);
  await deleteApprovedSender(`${username}@${domain()}`);
};
