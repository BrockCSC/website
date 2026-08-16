/**
 * Signature and disclaimer for club mail. `withFooter` only reaches mail sent
 * through this app's own JMAP client: Roundcube, Apple Mail and the Gmail app
 * submit over SMTP and bypass it. Covering those needs a Stalwart DATA-stage
 * Sieve script, which is not installed.
 */
import type { ExecRecord, SignupRecord } from "@/lib/api/types";
import { findAll, findById } from "@/lib/db/repository";
import { execsTable, signupsTable } from "@/lib/db/schema";
import { escapeHtml } from "./sanitize";

const CLUB = "Brock University Computer Science Club";
const SITE = "brockcsc.ca";

export const DISCLAIMER =
  "BrockCSC is a student club at Brock University. Views expressed are the sender's own and are not those of Brock University. This message may be confidential; if it reached you by mistake, please let us know and delete it.";

export type Signer = { name: string; title?: string };

/** Read from the exec tile rather than copied at provisioning time, so a title
 * change follows through to the signature. */
export const signerFor = async (localPart: string): Promise<Signer | null> => {
  const signup = (await findAll<SignupRecord>(signupsTable)).find(
    (record) => record.username === localPart,
  );
  if (!signup) return null;

  const exec = signup.execKey
    ? await findById<ExecRecord>(execsTable, signup.execKey)
    : null;
  const name =
    exec?.name ||
    [signup.firstName, signup.lastName].filter(Boolean).join(" ").trim();
  return name ? { name, title: exec?.title } : null;
};

const lines = ({ name, title }: Signer): string[] =>
  [name, title, CLUB].filter((line): line is string => Boolean(line));

export const textSignature = (signer: Signer): string =>
  `${lines(signer).join("\n")}\nhttps://${SITE}\n\n${DISCLAIMER}`;

export const htmlSignature = (signer: Signer): string =>
  `<p style="color:#4b5563;font-size:13px;line-height:1.5">${lines(signer)
    .map(escapeHtml)
    .join("<br />")}<br /><a href="https://${SITE}">${SITE}</a></p>` +
  `<p style="color:#6b7280;font-size:11px;line-height:1.5">${escapeHtml(DISCLAIMER)}</p>`;

/** Matched against the end of the body, not anywhere in it: a reply quoting an
 * earlier club message must still get its own signature. */
export const withFooter = (text: string, signer: Signer | null): string => {
  const footer = `\n\n-- \n${signer ? textSignature(signer) : DISCLAIMER}\n`;
  return text.endsWith(footer) ? text : `${text.replace(/\s+$/, "")}${footer}`;
};
