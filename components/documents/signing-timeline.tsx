"use client";

import {
  Ban,
  CircleCheckBig,
  CircleX,
  Eye,
  FilePlus2,
  RotateCw,
  Send,
  ShieldCheck,
  Signature,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import type { SigningRequestItem } from "@/lib/api/documents";
import type { SigningEvent, SigningEventType } from "@/lib/api/types";
import { formatSigningTime } from "@/lib/documents/signing-time";
import { cn } from "@/lib/utils";

const ICON: Record<SigningEventType, LucideIcon> = {
  created: FilePlus2,
  sent: Send,
  viewed: Eye,
  consented: ShieldCheck,
  signed: Signature,
  declined: CircleX,
  completed: CircleCheckBig,
  cancelled: Ban,
  resent: RotateCw,
  "signer-added": UserPlus,
  "signer-removed": UserMinus,
};

const TONE: Partial<Record<SigningEventType, string>> = {
  signed: "bg-brand text-brand-ink",
  completed: "bg-brand text-brand-ink",
  declined: "bg-surface text-destructive",
  cancelled: "bg-surface text-destructive",
};

/** Requests made before the audit trail only kept per-signer timestamps. */
const eventsFromTimestamps = (request: SigningRequestItem): SigningEvent[] => {
  const events: SigningEvent[] = [
    {
      type: "created",
      at: request.createdAt,
      actorName: request.createdByName,
      ip: request.createdByIp,
    },
  ];
  for (const s of request.signers) {
    if (s.notifiedAt)
      events.push({ type: "sent", at: s.notifiedAt, signerId: s.id });
    if (s.viewedAt)
      events.push({ type: "viewed", at: s.viewedAt, signerId: s.id });
    if (s.consentedAt)
      events.push({
        type: "consented",
        at: s.consentedAt,
        signerId: s.id,
        ip: s.consentIp,
      });
    if (s.signedAt)
      events.push({ type: "signed", at: s.signedAt, signerId: s.id, ip: s.ip });
    if (s.declinedAt)
      events.push({
        type: "declined",
        at: s.declinedAt,
        signerId: s.id,
        ip: s.ip,
      });
  }
  if (request.completedAt)
    events.push({ type: "completed", at: request.completedAt });
  if (request.cancelledAt)
    events.push({ type: "cancelled", at: request.cancelledAt });
  return events;
};

const describe = (event: SigningEvent, signerName: string | undefined) => {
  const who = signerName ?? "A signer";
  switch (event.type) {
    case "created":
      return "Request created";
    case "sent":
      return `Sent to ${who}`;
    case "viewed":
      return `Viewed by ${who}`;
    case "consented":
      return `${who} agreed to sign electronically`;
    case "signed":
      return `Signed by ${who}`;
    case "declined":
      return `Declined by ${who}`;
    case "completed":
      return "Completed: every signer has signed";
    case "cancelled":
      return "Request cancelled";
    case "resent":
      return `Link resent to ${who}`;
    case "signer-added":
      return signerName
        ? `${signerName} added as a signer`
        : "A signer was added";
    case "signer-removed":
      return signerName ? `${signerName} removed` : "A signer was removed";
  }
};

export function SigningTimeline({ request }: { request: SigningRequestItem }) {
  const recorded = !!request.events?.length;
  const events = (recorded ? request.events! : eventsFromTimestamps(request))
    .slice()
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return (
    <div>
      {!recorded && (
        <p className="mb-4 text-xs text-subtle">
          This request predates the full audit trail, so its history is rebuilt
          from the times saved on it.
        </p>
      )}
      <ol className="flex flex-col">
        {events.map((event, index) => {
          const Icon = ICON[event.type];
          const signerName = request.signers.find(
            (s) => s.id === event.signerId,
          )?.name;
          const actor =
            event.actorName && event.actorName !== signerName
              ? event.actorName
              : null;
          const last = index === events.length - 1;
          return (
            <li className="relative flex gap-3" key={`${event.type}-${index}`}>
              {!last && (
                <span
                  aria-hidden
                  className="absolute top-8 bottom-0 left-[15px] w-0.5 bg-line"
                />
              )}
              <span
                className={cn(
                  "relative flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-line",
                  TONE[event.type] ?? "bg-tint text-ink",
                )}
              >
                <Icon aria-hidden className="size-4" />
              </span>
              <div className={cn("min-w-0 pt-1", !last && "pb-5")}>
                <p className="text-sm font-bold text-ink">
                  {describe(event, signerName)}
                  {actor && (
                    <span className="font-normal text-subtle"> by {actor}</span>
                  )}
                </p>
                <p className="text-xs break-words text-subtle">
                  <time dateTime={event.at}>{formatSigningTime(event.at)}</time>
                  {event.ip && <> · IP {event.ip}</>}
                </p>
                {event.userAgent && (
                  <p
                    className="truncate text-[11px] text-subtle"
                    title={event.userAgent}
                  >
                    {event.userAgent}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
