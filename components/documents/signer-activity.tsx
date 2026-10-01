"use client";

import type { SafeSigner, SigningRequestItem } from "@/lib/api/documents";
import {
  SIGNATURE_FONTS,
  SIGNING_FIELD_DEFAULT_LABEL,
} from "@/lib/documents/fields";
import { formatSigningTime } from "@/lib/documents/signing-time";

/** A pending signer is either notified already or still queued behind earlier signers. */
export const signerStatusLabel = (signer: SafeSigner) => {
  if (signer.status !== "pending") return signer.status;
  return signer.notifiedAt ? "sent" : "waiting";
};

const describeAdopted = (signer: SafeSigner) => {
  const adopted = signer.adopted;
  if (!adopted) return null;
  const style =
    adopted.style === "drawn"
      ? "a drawn signature"
      : `a typed signature in ${SIGNATURE_FONTS.find((f) => f.id === adopted.font)?.label ?? "a script font"}`;
  return `Adopted ${style} as "${adopted.fullName}", initials "${adopted.initials}"`;
};

export function SignerActivity({
  request,
  signer,
}: {
  request: SigningRequestItem;
  signer: SafeSigner;
}) {
  const fields = request.fields?.filter((f) => f.signerId === signer.id) ?? [];
  const moments = [
    ["Sent", signer.notifiedAt],
    ["Viewed", signer.viewedAt],
    ["Consented", signer.consentedAt],
    ["Signed", signer.signedAt],
    ["Declined", signer.declinedAt],
  ].filter((m): m is [string, string] => !!m[1]);
  const adopted = describeAdopted(signer);

  return (
    <div className="mt-1 flex flex-col gap-0.5 text-xs text-subtle max-md:text-sm">
      {!!moments.length && (
        <p className="flex flex-wrap gap-x-3 gap-y-0.5">
          {moments.map(([label, at]) => (
            <span key={label}>
              {label}{" "}
              <time className="text-ink" dateTime={at}>
                {formatSigningTime(at)}
              </time>
            </span>
          ))}
        </p>
      )}
      {(signer.status === "signed" || signer.status === "declined") &&
        signer.ip && <p>From IP {signer.ip}</p>}
      {signer.consentIp && signer.consentIp !== signer.ip && (
        <p>Consented from IP {signer.consentIp}</p>
      )}
      {adopted && <p>{adopted}</p>}
      {!adopted && signer.status === "signed" && signer.signatureText && (
        <p>Typed signature &quot;{signer.signatureText}&quot;</p>
      )}
      {signer.status === "signed" &&
        fields
          .filter(
            (f) =>
              f.type !== "signature" &&
              f.type !== "initials" &&
              signer.fieldValues?.[f.id],
          )
          .map((f) => (
            <p key={f.id}>
              {f.label ?? SIGNING_FIELD_DEFAULT_LABEL[f.type]}: &quot;
              {signer.fieldValues![f.id]}&quot;
            </p>
          ))}
      {signer.status !== "signed" && !!fields.length && (
        <p>
          {fields.length} field{fields.length === 1 ? "" : "s"} placed for them
        </p>
      )}
      {signer.status === "declined" && signer.declineReason && (
        <p>Reason: {signer.declineReason}</p>
      )}
    </div>
  );
}

/** "2 of 4 signed" and who the request is waiting on, for status cards. */
export const signingProgress = (request: SigningRequestItem) => {
  const signers = request.signers.slice().sort((a, b) => a.order - b.order);
  const signed = signers.filter((s) => s.status === "signed").length;
  const waiting = signers.filter(
    (s) => s.status !== "signed" && s.status !== "declined",
  );
  const names = waiting.map((s) => s.name ?? "a signer");
  const waitingOn =
    request.mode === "ordered"
      ? names[0]
      : names.length <= 2
        ? names.join(" and ")
        : `${names.length} people`;
  return {
    signed,
    total: signers.length,
    /** The next signer in an ordered request, else the first one outstanding. */
    next: waiting[0] ?? null,
    waitingOn: waitingOn || null,
  };
};

/** A thin progress bar; the text next to it carries the meaning. */
export function SigningProgressBar({
  signed,
  total,
}: {
  signed: number;
  total: number;
}) {
  return (
    <div
      aria-hidden
      className="h-2.5 overflow-hidden rounded-full border-2 border-line bg-tint"
    >
      <div
        className="h-full bg-ink"
        style={{ width: `${total ? (signed / total) * 100 : 0}%` }}
      />
    </div>
  );
}
