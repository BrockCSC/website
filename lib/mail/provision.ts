import { usersWithRealmRole } from "@/lib/auth/keycloak-admin";
import { dottedAliasFor } from "@/lib/auth/username";
import { createApprovedSender, deleteApprovedSender } from "./oci-senders";
import {
  clearReadOnly,
  createMailbox,
  createMailingList,
  forwardingAccounts,
  getCatchAll,
  listMailingLists,
  listUsers,
  localPartTaken,
  makeReadOnly,
  revokeAppPasswords,
  setCatchAll,
  setExpungeAllowed,
  setForwarding,
  setGroupMembers,
  updateMailingList,
} from "./stalwart";

export const domain = () => process.env.MAIL_DOMAIN ?? "brockcsc.ca";

export const coPresidentsList = () =>
  process.env.CO_PRESIDENTS_LIST ?? "co-presidents";

const coPresidentsAddress = () => `${coPresidentsList()}@${domain()}`;

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

const syncCoPresidentsList = async (recipients: string[]): Promise<void> => {
  if (!recipients.length) return;
  const list = (await listMailingLists()).find(
    (one) => one.name === coPresidentsList(),
  );
  if (!list) {
    await createMailingList({
      name: coPresidentsList(),
      domain: domain(),
      description: "Every current co-president. Kept in sync with Keycloak.",
      recipients,
    });
  } else if (
    list.recipients.length !== recipients.length ||
    !recipients.every((address) => list.recipients.includes(address))
  ) {
    await updateMailingList(list.id, { recipients }, domain());
  }
};

const syncForwarding = async (holders: string[]): Promise<void> => {
  const { readMailSettings } = await import("./settings");
  const settings = await readMailSettings();
  const target = settings.forwardTo ?? coPresidentsAddress();
  const exempt = new Set([
    ...holders,
    ...protectedMailboxes(),
    ...settings.forwardingOff,
  ]);
  const forwarding = await forwardingAccounts();
  for (const user of await listUsers()) {
    const wanted = user.readOnly && !exempt.has(user.name);
    if (forwarding.has(user.name) === wanted) continue;
    await setForwarding(user.name, wanted ? target : null);
  }
};

/** Aliases that carry a club role follow whoever holds it. */
const syncRoleAliases = async (): Promise<void> => {
  const { readAliases, recipientsFor } = await import("./aliases");
  const directory = await readAliases();
  for (const alias of directory.aliases) {
    if (alias.synced || !alias.recipients.roles.length) continue;
    const wanted = await recipientsFor(alias.recipients);
    const current = [
      ...alias.recipients.people,
      ...alias.recipients.groups,
      ...alias.recipients.external,
      ...alias.delivered.filter((one) => !one.direct).map((one) => one.address),
    ];
    const same =
      wanted.length === new Set(current).size &&
      wanted.every((address) => current.includes(address));
    if (same) continue;
    await updateMailingList(alias.id, { recipients: wanted }, domain());
  }
};

/** admin@ membership, the co-presidents list, the catch-all and forwarding. */
export const syncMailRouting = async (): Promise<void> => {
  const holders = await approvers();
  await setGroupMembers(process.env.ADMIN_MAIL_GROUP ?? "admin", holders);
  await syncCoPresidentsList(holders.map((name) => `${name}@${domain()}`));
  const catchAll = await getCatchAll(domain());
  if (!catchAll && holders.length) {
    await setCatchAll(domain(), coPresidentsAddress());
  } else if (catchAll === coPresidentsAddress() && !holders.length) {
    await setCatchAll(domain(), null);
  }
  await syncForwarding(holders);
  await syncRoleAliases();
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
  await setForwarding(exec.username, null);
  await syncExpungeRights();
  await createApprovedSender(`${exec.username}@${domain()}`);
};

export const makeMailboxReadOnly = async (username: string): Promise<void> => {
  if (isProtectedMailbox(username)) return;
  await makeReadOnly(username);
  await setForwarding(username, coPresidentsAddress());
  await revokeAppPasswords(username);
  await deleteApprovedSender(`${username}@${domain()}`);
};
