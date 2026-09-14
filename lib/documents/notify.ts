import type { DocumentRecord, Signer, SignupRecord } from "@/lib/api/types";
import { findById } from "@/lib/db/repository";
import { signupsTable } from "@/lib/db/schema";
import { sendSystemEmail, siteUrl } from "@/lib/mail/system-mail";

const mailDomain = () => process.env.MAIL_DOMAIN ?? "brockcsc.ca";

/** Same "personal address or club mailbox" pair forgot-password mails to. */
const memberAddresses = async (signupId: string): Promise<string[]> => {
  const signup = await findById<SignupRecord>(signupsTable, signupId);
  if (!signup) return [];
  return [
    signup.email ?? "",
    signup.username ? `${signup.username}@${mailDomain()}` : "",
  ].filter(Boolean);
};

/** No mail failure here should ever block a state change that already happened. */
const safeSend = (msg: Parameters<typeof sendSystemEmail>[0]) =>
  void sendSystemEmail(msg).catch((err) => {
    console.error(
      `documents: notification email failed: ${err instanceof Error ? err.message : err}`,
    );
  });

export const notifyMemberSigner = async (
  signer: Signer,
  document: DocumentRecord,
  signingRequestId: string,
): Promise<void> => {
  if (!signer.signupId) return;
  const to = await memberAddresses(signer.signupId);
  safeSend({
    to,
    subject: `Signature needed: ${document.title}`,
    text: [
      `${document.title} is waiting on your signature.`,
      "",
      `Log in to the admin portal to review and sign it: ${siteUrl()}/admin/documents/signing/${signingRequestId}`,
    ].join("\n"),
  });
};

export const notifyExternalSigner = async (
  signer: Signer,
  rawToken: string,
  document: DocumentRecord,
): Promise<void> => {
  if (!signer.email) return;
  safeSend({
    to: [signer.email],
    subject: `Signature requested: ${document.title}`,
    text: [
      `${signer.name ?? "Hello"},`,
      "",
      `BrockCSC has asked you to review and sign "${document.title}".`,
      "",
      `Open it here: ${siteUrl()}/sign/${rawToken}`,
      "",
      "This link works only for you, expires in 14 days, and stops working once you sign or decline.",
    ].join("\n"),
  });
};

export const notifyCompletion = async (
  addresses: string[],
  document: DocumentRecord,
): Promise<void> => {
  safeSend({
    to: addresses,
    subject: `Signed: ${document.title}`,
    text: [
      `Every signer has responded on "${document.title}".`,
      "",
      "The completion record is stored in the document library alongside the original.",
    ].join("\n"),
  });
};

export const notifyDeclined = async (
  addresses: string[],
  document: DocumentRecord,
  signer: Signer,
): Promise<void> => {
  safeSend({
    to: addresses,
    subject: `Signing declined: ${document.title}`,
    text: [
      `${signer.name ?? "A signer"} declined to sign "${document.title}".`,
      signer.declineReason ? `Reason given: ${signer.declineReason}` : "",
      "",
      "The signing request has stopped. Cancel it in the portal and start a new one if needed.",
    ]
      .filter(Boolean)
      .join("\n"),
  });
};

export const signerEmailAddresses = async (
  signer: Signer,
): Promise<string[]> =>
  signer.kind === "external"
    ? [signer.email ?? ""].filter(Boolean)
    : signer.signupId
      ? memberAddresses(signer.signupId)
      : [];
