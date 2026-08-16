import { dottedAliasFor } from "@/lib/auth/username";
import { createApprovedSender, deleteApprovedSender } from "./oci-senders";
import { createMailbox, localPartTaken, makeReadOnly } from "./stalwart";

const domain = () => process.env.MAIL_DOMAIN ?? "brockcsc.ca";

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
  await makeReadOnly(username);
  await deleteApprovedSender(`${username}@${domain()}`);
};
