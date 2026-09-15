import type {
  DocumentRecord,
  Signer,
  SigningRequestRecord,
} from "@/lib/api/types";
import { type Entity, findAll } from "@/lib/db/repository";
import { documentsTable, signingRequestsTable } from "@/lib/db/schema";
import { envelopeIdFor } from "@/lib/documents/envelope";
import { clubDay, longDate, rangeStartDay, shortDate } from "../dates";
import { dateRangeError } from "../params";
import { MISSING_VALUE, plural } from "../text";
import type { ExportReport, ReportCell } from "../types";

type RegisterStatus = Exclude<SigningRequestRecord["status"], "draft">;

/** Only what the register prints: no emails, IPs, user agents, decline reasons, tokens or field values. */
type SafeRequest = {
  envelopeId: string;
  title: string;
  documentTitle: string;
  status: RegisterStatus;
  createdByName: string;
  createdAt: string;
  completedAt?: string;
  cancelledAt?: string;
  signers: {
    name: string;
    status: Signer["status"];
    signedAt?: string;
    declinedAt?: string;
  }[];
};

type SigningRegisterData = {
  from: string;
  to: string;
  requests: SafeRequest[];
};

const STATUS_LABELS: Record<RegisterStatus, string> = {
  sent: "In progress",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
};

const safeRequests = (
  requests: Entity<SigningRequestRecord>[],
  documents: Entity<DocumentRecord>[],
  from: string,
  to: string,
): SafeRequest[] => {
  const documentTitles = new Map(documents.map((d) => [d.id, d.title]));
  const kept: SafeRequest[] = [];
  for (const request of requests) {
    if (request.status === "draft") continue;
    const time = Date.parse(request.createdAt);
    if (Number.isNaN(time)) continue;
    const day = clubDay(new Date(time));
    if (day < from || day > to) continue;
    kept.push({
      envelopeId: envelopeIdFor(request),
      title: request.title.trim(),
      documentTitle: documentTitles.get(request.documentId)?.trim() ?? "",
      status: request.status,
      createdByName: request.createdByName?.trim() ?? "",
      createdAt: request.createdAt,
      completedAt: request.completedAt,
      cancelledAt: request.cancelledAt,
      signers: [...request.signers]
        .sort((a, b) => a.order - b.order)
        .map((s) => ({
          name:
            s.name?.trim() ||
            (s.kind === "external" ? "External signer" : "Member"),
          status: s.status,
          signedAt: s.signedAt,
          declinedAt: s.declinedAt,
        })),
    });
  }
  return kept.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
};

const signerLine = (
  signer: SafeRequest["signers"][number],
  open: boolean,
): string => {
  const state = {
    signed: `signed ${shortDate(signer.signedAt)}`,
    declined: `declined ${shortDate(signer.declinedAt)}`,
    // A cancelled or declined request stops everyone who hadn't responded.
    viewed: open ? "viewed" : "viewed, not signed",
    pending: open ? "waiting" : "not signed",
  }[signer.status].trim();
  return `${signer.name} — ${state}`;
};

const requestRow = (request: SafeRequest): ReportCell[] => {
  const closed = shortDate(
    request.completedAt ||
      request.cancelledAt ||
      request.signers.find((s) => s.status === "declined")?.declinedAt,
  );
  return [
    [{ text: request.envelopeId.slice(0, 8), muted: true }],
    {
      lines: [
        [{ text: request.title || "Untitled request", bold: true }],
        ...(request.documentTitle && request.documentTitle !== request.title
          ? [[{ text: request.documentTitle, muted: true }]]
          : []),
      ],
    },
    request.signers.length
      ? {
          lines: request.signers.map((s) =>
            signerLine(s, request.status === "sent"),
          ),
        }
      : MISSING_VALUE,
    {
      lines: [
        STATUS_LABELS[request.status],
        ...(closed ? [[{ text: closed, muted: true }]] : []),
      ],
    },
    {
      lines: [
        request.createdByName || MISSING_VALUE,
        [{ text: shortDate(request.createdAt), muted: true }],
      ],
    },
  ];
};

export const signingRegisterReport: ExportReport<SigningRegisterData> = {
  id: "signing-register",
  title: "Signing Register",
  description:
    "Signing requests between two dates with each signer's status, for the club's governance records and handover.",
  confidential: true,
  params: [
    { name: "from", label: "From", kind: "date" },
    { name: "to", label: "To", kind: "date" },
  ],
  defaults: (now) => ({ from: rangeStartDay(now), to: clubDay(now) }),
  validate: dateRangeError,
  load: async ({ params }) => {
    const [requests, documents] = await Promise.all([
      findAll<SigningRequestRecord>(signingRequestsTable),
      findAll<DocumentRecord>(documentsTable),
    ]);
    return {
      from: params.from,
      to: params.to,
      requests: safeRequests(requests, documents, params.from, params.to),
    };
  },
  preview: ({ from, to, requests }) => ({
    summary: `${requests.length} signing request${plural(requests.length)} between ${longDate(from)} and ${longDate(to)}.`,
  }),
  render: ({ from, to, requests }) => {
    const count = (status: RegisterStatus) =>
      String(requests.filter((r) => r.status === status).length);
    return {
      kind: "report",
      title: "Signing Register",
      subtitle: `${longDate(from)} to ${longDate(to)}`,
      blocks: [
        {
          kind: "fields",
          items: [
            { label: "Signing requests", value: String(requests.length) },
            { label: "Completed", value: count("completed") },
            { label: "In progress", value: count("sent") },
            { label: "Declined", value: count("declined") },
            { label: "Cancelled", value: count("cancelled") },
          ],
        },
        {
          kind: "table",
          columns: [
            { title: "Envelope", width: 62, nowrap: true },
            { title: "Request", width: 128 },
            { title: "Signers", width: 170 },
            { title: "Status", width: 70 },
            { title: "Requested", width: 70 },
          ],
          rows: requests.map(requestRow),
          empty: "No signing requests in this period.",
        },
        {
          kind: "note",
          text: "Signer email addresses, IP addresses and decline reasons are left out; each completed envelope's certificate of completion holds the full audit trail. Deleting a document also deletes its cancelled and declined signing requests, so those don't appear here.",
        },
      ],
    };
  },
};
