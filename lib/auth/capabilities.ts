type Capability = {
  label: string;
  detail: string;
};

export const execRole = () => process.env.ADMIN_ROLE ?? "executive";
export const alumniRole = () => process.env.ALUMNI_ROLE ?? "alumni";
export const approverRole = () =>
  process.env.APPROVER_ROLE ?? "brockcsc-approver";
export const ownerRole = () => process.env.SUPERUSER_ROLE ?? "owner";
export const mailAdminRole = () =>
  process.env.MAIL_ADMIN_ROLE ?? "brockcsc-mail-admin";
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

const MAIL_ADMIN: Capability[] = [
  {
    label: "Every inbox",
    detail: "Reads any club mailbox from the portal, without changing it.",
  },
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

export const capabilitiesOf = (role: string): Capability[] => {
  if (role === ownerRole()) return OWNER;
  if (role === CO_PRESIDENT) return [...EXEC, ...APPROVER, ...MAIL_ADMIN];
  if (role === execRole()) return EXEC;
  if (role === approverRole()) return APPROVER;
  if (role === mailAdminRole()) return MAIL_ADMIN;
  if (role === alumniRole()) return ALUMNI;
  return [];
};

/** co-president is composite in Keycloak: holding it grants these too. */
export const impliedBy = (role: string): string[] =>
  role === CO_PRESIDENT ? [execRole(), approverRole(), mailAdminRole()] : [];
