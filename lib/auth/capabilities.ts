export type Capability = {
  label: string;
  detail: string;
};

export const execRole = () => process.env.ADMIN_ROLE ?? "executive";
export const alumniRole = () => process.env.ALUMNI_ROLE ?? "alumni";
export const approverRole = () =>
  process.env.APPROVER_ROLE ?? "brockcsc-approver";
export const ownerRole = () => process.env.SUPERUSER_ROLE ?? "owner";
export const CO_PRESIDENT = "co-president";

const EXEC: Capability[] = [
  { label: "Admin portal", detail: "Signs in and reaches every section." },
  { label: "Events", detail: "Creates, edits and deletes club events." },
  { label: "Mail", detail: "Reads and sends from their club mailbox." },
  { label: "Uploads", detail: "Adds images used across the site." },
];

const APPROVER: Capability[] = [
  { label: "Sign-ups", detail: "Approves or rejects account requests." },
  { label: "People", detail: "Changes roles, mailboxes and public tiles." },
  { label: "Requests", detail: "Grants send limits and permanent deletions." },
];

const ALUMNI: Capability[] = [
  {
    label: "Own tile",
    detail: "Edits their own team page entry, nothing else.",
  },
];

const OWNER: Capability[] = [
  {
    label: "Everything",
    detail: "Satisfies every permission check in the app.",
  },
];

/** co-president is composite in Keycloak: holding it grants exec and approver. */
export const GRANTED_BY: Record<string, string[]> = {
  [CO_PRESIDENT]: [execRole(), approverRole()],
};

export const capabilitiesOf = (role: string): Capability[] => {
  if (role === ownerRole()) return OWNER;
  if (role === CO_PRESIDENT) return [...EXEC, ...APPROVER];
  if (role === execRole()) return EXEC;
  if (role === approverRole()) return APPROVER;
  if (role === alumniRole()) return ALUMNI;
  return [];
};

export const impliedBy = (role: string): string[] => GRANTED_BY[role] ?? [];
