/**
 * Signature and disclaimer for club mail. `withFooter` only reaches mail sent
 * through this app's own JMAP client: Apple Mail and the Gmail app submit over
 * SMTP and bypass it. Covering those needs a Stalwart DATA-stage Sieve script,
 * which is not installed.
 */
import type { ExecRecord, SignupRecord } from "@/lib/api/types";
import { findAll, findById } from "@/lib/db/repository";
import { execsTable, signupsTable } from "@/lib/db/schema";
import { escapeHtml } from "./sanitize";

const CLUB = "Brock University Computer Science Club";
const SITE = "brockcsc.ca";
const SITE_URL = () => process.env.MAIL_SITE_URL ?? `https://${SITE}`;

export const DISCLAIMER =
  "BrockCSC is a student club at Brock University. Views expressed are the sender's own and are not those of Brock University. This message may be confidential; if it reached you by mistake, please let us know and delete it.";

export type Signer = { name: string; title?: string; photo?: string };

/** Shared mailboxes speak for the club, not a person. */
const GENERIC: Signer = { name: "BrockCSC" };

/** Read from the exec tile rather than copied at provisioning time, so a title
 * change follows through to the signature. */
export const signerFor = async (localPart: string): Promise<Signer> => {
  const signup = (await findAll<SignupRecord>(signupsTable)).find(
    (record) => record.username === localPart,
  );
  if (!signup) return GENERIC;

  const exec = signup.execKey
    ? await findById<ExecRecord>(execsTable, signup.execKey)
    : null;
  const name =
    exec?.name ||
    [signup.firstName, signup.lastName].filter(Boolean).join(" ").trim();
  if (!name) return GENERIC;

  const image = exec?.image?.url;
  return {
    name,
    title: exec?.title,
    photo: image?.startsWith("/") ? `${SITE_URL()}${image}` : image,
  };
};

const lines = ({ name, title }: Signer): string[] =>
  [name, title, CLUB].filter((line): line is string => Boolean(line));

export const textSignature = (signer: Signer): string =>
  `${lines(signer).join("\n")}\nhttps://${SITE}\n\n${DISCLAIMER}`;

/** Tables and inline styles, because Outlook renders neither flexbox nor a
 * stylesheet. The avatar is the sender's own photo where they have one, and the
 * club mark otherwise. */
export const htmlSignature = (signer: Signer): string => {
  const site = SITE_URL();
  const avatar = signer.photo ?? `${site}/email-logo.png`;
  const detail = [signer.title, CLUB]
    .filter(Boolean)
    .map(
      (line) =>
        `<div style="font-size:12px;line-height:1.45;color:#4b5563">${escapeHtml(line as string)}</div>`,
    )
    .join("");

  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:18px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">` +
    `<tr>` +
    `<td style="padding-right:14px;vertical-align:top">` +
    `<img src="${escapeHtml(avatar)}" width="52" height="52" alt="" style="width:52px;height:52px;border-radius:10px;border:0" />` +
    `</td>` +
    `<td style="vertical-align:top;border-left:3px solid #9A4440;padding-left:14px">` +
    `<div style="font-size:14px;font-weight:700;line-height:1.45;color:#9A4440">${escapeHtml(signer.name)}</div>` +
    detail +
    `<a href="${site}" style="font-size:12px;line-height:1.45;color:#9A4440;text-decoration:none">${SITE}</a>` +
    `</td>` +
    `</tr>` +
    `</table>` +
    `<p style="margin-top:14px;max-width:520px;font-size:11px;line-height:1.5;color:#6b7280;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">${escapeHtml(DISCLAIMER)}</p>`
  );
};

/** Matched against the end of the body, not anywhere in it: a reply quoting an
 * earlier club message must still get its own signature. */
export const withHtmlFooter = (html: string, signer: Signer): string =>
  `${html}<div style="margin-top:24px;border-top:1px solid #e5e7eb"></div>${htmlSignature(signer)}`;

export const withFooter = (text: string, signer: Signer): string => {
  const footer = `\n\n-- \n${textSignature(signer)}\n`;
  return text.endsWith(footer) ? text : `${text.replace(/\s+$/, "")}${footer}`;
};
