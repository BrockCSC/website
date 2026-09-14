import type {
  DocumentRecord,
  Signer,
  SigningRequestRecord,
  SignupRecord,
} from "@/lib/api/types";
import { type Entity, findById } from "@/lib/db/repository";
import { signupsTable } from "@/lib/db/schema";
import { sendSystemEmail, siteUrl } from "@/lib/mail/system-mail";
import { envelopeIdFor } from "./envelope";

type SigningRequest = Entity<SigningRequestRecord>;

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

/** The club mailbox only: what a certificate every signer can read shows for a member. */
export const memberClubAddress = async (
  signupId: string,
): Promise<string | undefined> => {
  const signup = await findById<SignupRecord>(signupsTable, signupId);
  return signup?.username ? `${signup.username}@${mailDomain()}` : undefined;
};

/** No mail failure here should ever block a state change that already happened. */
const safeSend = (msg: Parameters<typeof sendSystemEmail>[0]) =>
  void sendSystemEmail(msg).catch((err) => {
    console.error(
      `documents: notification email failed: ${err instanceof Error ? err.message : err}`,
    );
  });

const sender = (request: SigningRequest) =>
  request.createdByName ? `${request.createdByName} at BrockCSC` : "BrockCSC";

const memberSigningUrl = (request: SigningRequest) =>
  `${siteUrl()}/admin/documents/signing/${request.id}`;

export const notifyMemberSigner = async (
  signer: Signer,
  document: DocumentRecord,
  request: SigningRequest,
): Promise<void> => {
  if (!signer.signupId) return;
  const to = await memberAddresses(signer.signupId);
  safeSend({
    to,
    subject: `Signature needed: ${document.title}`,
    text: [
      `${sender(request)} sent you "${request.title}" to review and sign with BrockCSC Sign.`,
      "",
      `Log in to review and sign it in your browser: ${memberSigningUrl(request)}`,
      "",
      `Envelope ID: ${envelopeIdFor(request)}`,
    ].join("\n"),
  });
};

export const notifyExternalSigner = async (
  signer: Signer,
  rawToken: string,
  document: DocumentRecord,
  request: SigningRequest,
): Promise<void> => {
  if (!signer.email) return;
  safeSend({
    to: [signer.email],
    subject: `Signature requested: ${document.title}`,
    text: [
      `${signer.name ?? "Hello"},`,
      "",
      `${sender(request)} sent you "${request.title}" to review and sign with BrockCSC Sign. You can read and sign it in your browser; there is nothing to download.`,
      "",
      `Review and sign: ${siteUrl()}/sign/${rawToken}`,
      "",
      "This link works only for you and expires in 14 days.",
      "",
      `Envelope ID: ${envelopeIdFor(request)}`,
    ].join("\n"),
  });
};

/**
 * One email per requester and signer, each linking to an in-browser view of
 * the signed document and its certificate. Nothing is attached. An address
 * already mailed is skipped, so a requester who also signed hears once.
 */
export const notifyEnvelopeCompleted = async (
  document: DocumentRecord,
  request: SigningRequest,
  viewTokens: Map<string, string>,
): Promise<void> => {
  const mailed = new Set<string>();
  const send = (to: string[], text: string[]) => {
    const fresh = to.filter((a) => a && !mailed.has(a.toLowerCase()));
    if (!fresh.length) return;
    for (const address of fresh) mailed.add(address.toLowerCase());
    safeSend({
      to: fresh,
      subject: `Completed: ${document.title}`,
      text: text.join("\n"),
    });
  };
  const summary = `Everyone has signed "${request.title}".`;
  const footer = ["", `Envelope ID: ${envelopeIdFor(request)}`];
  const memberText = (name?: string) => [
    ...(name ? [`${name},`, ""] : []),
    summary,
    "",
    `View the signed document and its Certificate of Completion in your browser: ${memberSigningUrl(request)}`,
    ...footer,
  ];

  if (request.createdByEmail) {
    send([request.createdByEmail], memberText(request.createdByName));
  }
  const ordered = request.signers.slice().sort((a, b) => a.order - b.order);
  for (const signer of ordered) {
    if (signer.kind === "member" && signer.signupId) {
      send(await memberAddresses(signer.signupId), memberText(signer.name));
      continue;
    }
    const raw = viewTokens.get(signer.id);
    if (signer.kind !== "external" || !signer.email) continue;
    send(
      [signer.email],
      [
        `${signer.name ?? "Hello"},`,
        "",
        summary,
        "",
        raw
          ? `View the signed document and its Certificate of Completion in your browser: ${siteUrl()}/signed/${raw}`
          : `Ask ${sender(request)} for a copy of the signed document.`,
        ...(raw
          ? ["", "This link works only for you and expires in 30 days."]
          : []),
        ...footer,
      ],
    );
  }
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
