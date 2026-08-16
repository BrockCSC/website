import { dottedAliasFor } from "@/lib/auth/username";
import { createApprovedSender, deleteApprovedSender } from "./oci-senders";
import { createMailbox, localPartTaken, makeReadOnly } from "./stalwart";

const domain = () => process.env.MAIL_DOMAIN ?? "brockcsc.ca";

/** Both halves are idempotent, so a failed approval can be retried safely. */
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

/**
 * Alumni keep a read-only inbox: they can still sign in and read their archive,
 * but cannot send. Dropping the approved sender is what keeps them off the OCI
 * send quota; the Stalwart permission is what stops the attempt reaching it.
 */
export const makeMailboxReadOnly = async (username: string): Promise<void> => {
  await makeReadOnly(username);
  await deleteApprovedSender(`${username}@${domain()}`);
};
