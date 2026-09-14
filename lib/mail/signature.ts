import type { ExecRecord, SignupRecord } from "@/lib/api/types";
import { CLUB_MAILING_ADDRESS, CLUB_NAME } from "@/lib/brand";
import { findAll, findById } from "@/lib/db/repository";
import { execsTable, signupsTable } from "@/lib/db/schema";
import { escapeHtml } from "./sanitize";

const CLUB = CLUB_NAME;
const SITE = "brockcsc.ca";
const SITE_URL = () => process.env.MAIL_SITE_URL ?? `https://${SITE}`;
const MAILING_ADDRESS = CLUB_MAILING_ADDRESS;

/** The mailbox transactional mail (password resets) is sent from. */
export const SYSTEM_SENDER = "security";

// Read from env directly: importing provision.ts here would cycle back through jmap-mail.ts.
const mailDomain = () => process.env.MAIL_DOMAIN ?? SITE;
const helpAddress = () =>
  `${process.env.CO_PRESIDENTS_LIST ?? "co-presidents"}@${mailDomain()}`;

const CONFIDENTIALITY =
  "Confidentiality notice: this email and any attachments are intended only for the named recipients and may contain confidential or personal information. If you received it in error, please let the sender know, delete it, and do not copy, forward or use its contents.";
const AFFILIATION =
  "BrockCSC is a student club at Brock University. Views expressed are the sender's own and not those of Brock University.";
const automatedNotice = () =>
  `This is an automated message from BrockCSC and replies to it are not read. For help, contact ${helpAddress()}. BrockCSC will never ask for your password by email.`;

export type Signer = {
  name: string;
  title?: string;
  email?: string;
  automated?: boolean;
};

export const signerFor = async (account: string): Promise<Signer> => {
  const localPart = account.split("@")[0].toLowerCase();
  const email = `${localPart}@${mailDomain()}`;
  // Shared mailboxes speak for the club, not a person.
  const generic: Signer = { name: "BrockCSC", email };
  if (localPart === SYSTEM_SENDER) return { ...generic, automated: true };

  const signup = (await findAll<SignupRecord>(signupsTable)).find(
    (record) => record.username?.toLowerCase() === localPart,
  );
  if (!signup) return generic;

  const exec = signup.execKey
    ? await findById<ExecRecord>(execsTable, signup.execKey)
    : null;
  const name =
    exec?.name ||
    [signup.firstName, signup.lastName].filter(Boolean).join(" ").trim();
  if (!name) return generic;

  return { name, title: exec?.title, email };
};

const notices = (signer: Signer): string[] => [
  ...(signer.automated ? [automatedNotice()] : []),
  CONFIDENTIALITY,
  AFFILIATION,
];

export const textSignature = (signer: Signer): string =>
  [
    [signer.name, signer.title, CLUB]
      .filter((line): line is string => Boolean(line))
      .join("\n"),
    [signer.email, `https://${SITE}`].filter(Boolean).join(" | "),
    MAILING_ADDRESS,
    "",
    notices(signer).join("\n\n"),
  ].join("\n");

const FONT = "font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif";
const LINK = "color:#9A4440;text-decoration:none";

export const htmlSignature = (signer: Signer): string => {
  const site = SITE_URL();
  const detail = [signer.title, CLUB]
    .filter((line): line is string => Boolean(line))
    .map(
      (line) =>
        `<div style="font-size:12px;line-height:1.45;color:#4b5563">${escapeHtml(line)}</div>`,
    )
    .join("");
  const contact = [
    signer.email
      ? `<a href="mailto:${escapeHtml(signer.email)}" style="${LINK}">${escapeHtml(signer.email)}</a>`
      : "",
    `<a href="${site}" style="${LINK}">${SITE}</a>`,
  ]
    .filter(Boolean)
    .join(`<span style="color:#9ca3af"> &nbsp;|&nbsp; </span>`);

  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:18px;${FONT}">` +
    `<tr>` +
    `<td valign="middle" style="padding-right:14px;vertical-align:middle">` +
    `<img src="${site}/email-logo.png" width="52" height="52" alt="BrockCSC" style="display:block;width:52px;height:52px;border-radius:10px;border:0" />` +
    `</td>` +
    `<td valign="middle" style="vertical-align:middle;border-left:3px solid #9A4440;padding-left:14px">` +
    `<div style="font-size:14px;font-weight:700;line-height:1.45;color:#9A4440">${escapeHtml(signer.name)}</div>` +
    detail +
    `<div style="font-size:12px;line-height:1.45">${contact}</div>` +
    `<div style="font-size:11px;line-height:1.45;color:#6b7280">${escapeHtml(MAILING_ADDRESS)}</div>` +
    `</td>` +
    `</tr>` +
    `</table>` +
    notices(signer)
      .map(
        (notice) =>
          `<p style="margin:12px 0 0;max-width:560px;font-size:11px;line-height:1.5;color:#6b7280;${FONT}">${escapeHtml(notice)}</p>`,
      )
      .join("")
  );
};

export const withHtmlFooter = (html: string, signer: Signer): string =>
  `${html}<div style="margin-top:24px;border-top:1px solid #e5e7eb"></div>${htmlSignature(signer)}`;

export const withFooter = (text: string, signer: Signer): string => {
  const footer = `\n\n-- \n${textSignature(signer)}\n`;
  return text.endsWith(footer) ? text : `${text.replace(/\s+$/, "")}${footer}`;
};
