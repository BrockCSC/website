export type WithKey<T> = T & { $key: string };

export type SessionUser = {
  sub: string;
  email: string;
  name: string;
  roles: string[];
  /** Current exec: may manage events and see the dashboard. */
  isExecutive?: boolean;
  /** Holds the approver role, so may manage executives. */
  isApprover?: boolean;
  /** Holds the mail admin role, so may read every inbox. */
  isMailAdmin?: boolean;
  /** Current exec or alumnus. False once every role is revoked. */
  isMember?: boolean;
  /** False outside production, where identity changes are only rehearsed. */
  identitiesEditable?: boolean;
};

export type ExecSocialLinks = {
  github?: string;
  linkedin?: string;
  instagram?: string;
  x?: string;
};

export type ExecRecord = {
  name?: string;
  title?: string;
  description?: string;
  isCurrentExec?: boolean;
  /** Set by the exec themselves to stay off the public team page. */
  hidden?: boolean;
  /** Every academic year served, newest first. The source of truth. */
  terms?: string[];
  /** Newest of `terms`, rewritten with it. Written before `terms` existed, so reads still count it. */
  term?: string;
  socials?: ExecSocialLinks;
  image?: {
    url?: string;
    name?: string;
    path?: string;
    position?: string;
  };
};

export type SignupInput = {
  inviteCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  studentId: string;
  isFormerExec: boolean;
  password: string;
  confirmPassword: string;
};

type SignupStatus = "pending" | "approved" | "rejected";

export type MailLimitRequest = {
  requested: number;
  reason?: string;
  requestedAt: string;
  status: "pending" | "approved" | "declined";
  reviewedBy?: string;
  reviewedAt?: string;
};

export type MailDeletionRequest = {
  id: string;
  messageIds: string[];
  subject?: string;
  reason?: string;
  requestedAt: string;
  status: "pending" | "approved" | "declined" | "done";
  reviewedBy?: string;
  reviewedAt?: string;
  deletedAt?: string;
};

export type SignupRecord = {
  firstName?: string;
  lastName?: string;
  username?: string;
  email?: string;
  phone?: string;
  studentId?: string;
  /** 5-digit number printed on the physical access card. Optional. */
  accessCardId?: string;
  /** Alumni have no Brock email or student number any more. */
  isFormerExec?: boolean;
  keycloakUserId?: string;
  /** Shown once at sign-up; the approver checks it out-of-band. */
  confirmationCode?: string;
  status?: SignupStatus;
  /** Beats MAIL_DAILY_LIMIT. Only an approver may set it. */
  mailDailyLimit?: number;
  mailLimitRequest?: MailLimitRequest | null;
  /** Many may be open at once: one per message the member wants destroyed. */
  mailDeletionRequests?: MailDeletionRequest[];
  execKey?: string | null;
  submittedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  /** Set by an admin-triggered password reset; cleared once they set their own. */
  passwordResetRequired?: boolean;
};

export type MailForwardingBlocker =
  "no-mailbox" | "read-only" | "no-personal-email" | "club-address";

export type MailForwardingView = {
  enabled: boolean;
  /** Why forwarding can't be turned on; null when it can. Turning it off is always allowed. */
  blocker: MailForwardingBlocker | null;
  personalEmail: string | null;
  clubAddress: string | null;
  /** This environment shares the live mail server, so a change isn't applied. */
  rehearsed?: boolean;
};

export type PasswordResetRecord = {
  signupId: string;
  /** sha256 of the raw token mailed to the user; the raw value is never stored. */
  tokenHash: string;
  expiresAt: string;
};

/** Display name and aliases live on the Stalwart account itself, not here. */
export type SharedMailboxRecord = {
  username: string;
  createdBy: string;
  createdAt: string;
  mailDailyLimit?: number;
};

export type RetiredMailboxRecord = {
  username: string;
  /** The Stalwart MailingList forwarding this address to the co-presidents. */
  mailingListId: string;
  retiredAt: string;
  /** The sweep destroys the list once this passes. */
  removeAt: string;
  removed?: boolean;
};

export type DayCount = { day: string; count: number };

export type DashboardStats = {
  pageViews: {
    last30Days: number;
    previous30Days: number;
    topPaths: { path: string; views: number }[];
    /** 30 buckets, oldest first, zero-filled. */
    daily: DayCount[];
    firstRecordedDay: string | null;
  };
  execs: {
    current: number;
    past: number;
    /** Current execs with no photo or no bio — the chase list. */
    incompleteProfiles: number;
  };
  events: {
    upcoming: number;
    past: number;
    next: { title: string; inDays: number } | null;
  };
  /** Null when the admin may not approve sign-ups. */
  signups: {
    pending: number;
    approved: number;
    rejected: number;
    daily: DayCount[];
  } | null;
  /** Current execs with no login account. Null for non-approvers. */
  unclaimedTiles: number | null;
};

export type DocumentRecord = {
  title: string;
  description?: string;
  currentVersionId: string | null;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
};

export type DocumentVersionRecord = {
  documentId: string;
  storedFilename: string;
  originalFilename: string;
  contentType: string;
  size: number;
  sha256: string;
  uploadedBy: string;
  uploadedByName?: string;
  uploadedAt: string;
  note?: string;
  /** Set when this version is a generated signing-completion record. */
  producedBySigningRequestId?: string;
};

type SignerKind = "member" | "external";
type SignerStatus = "pending" | "viewed" | "signed" | "declined";

export type Signer = {
  id: string;
  kind: SignerKind;
  order: number;
  /** Member signers only: the signups row id. */
  signupId?: string;
  name?: string;
  /** External signers only. */
  email?: string;
  status: SignerStatus;
  /** Kept after they sign or decline, so the link still shows their status. Cleared if the request stops before they respond; replaced on resend. */
  tokenHash?: string | null;
  tokenExpiresAt?: string | null;
  /** Set once their invite/notice email goes out, so a re-run of the eligibility sweep doesn't re-send it. */
  notifiedAt?: string;
  viewedAt?: string;
  signedAt?: string;
  declinedAt?: string;
  declineReason?: string;
  signatureText?: string;
  ip?: string;
  userAgent?: string;
  /** Set on sign, when the request has fields: this signer's own field id -> typed value. */
  fieldValues?: Record<string, string>;
  /** When they accepted the electronic record and signature disclosure; signing is refused without it. */
  consentedAt?: string;
  consentIp?: string;
  /** The signature and initials they adopted at signing time. */
  adopted?: AdoptedSignature;
  /** External signers only: hashed read-only link to the completed envelope. */
  viewTokenHash?: string | null;
  viewTokenExpiresAt?: string | null;
};

export const SIGNATURE_FONT_IDS = [
  "dancing-script",
  "great-vibes",
  "caveat",
  "homemade-apple",
] as const;

export type SignatureFontId = (typeof SIGNATURE_FONT_IDS)[number];

export type AdoptedSignature = {
  fullName: string;
  initials: string;
  style: "typed" | "drawn";
  /** Typed style only. */
  font?: SignatureFontId;
  /** Drawn style only: storedFilename (under DOCUMENTS_DIR) of the trimmed transparent PNG. Never a data URL. */
  signatureImage?: string;
  initialsImage?: string;
  adoptedAt: string;
};

export type SigningEventType =
  | "created"
  | "sent"
  | "viewed"
  | "consented"
  | "signed"
  | "declined"
  | "completed"
  | "cancelled"
  | "resent"
  | "signer-added"
  | "signer-removed";

/** Append-only audit trail; the certificate of completion is built from these. */
export type SigningEvent = {
  type: SigningEventType;
  at: string;
  signerId?: string;
  actorName?: string;
  ip?: string;
  userAgent?: string;
};

type SigningRequestStatus =
  "draft" | "sent" | "completed" | "cancelled" | "declined";

/** "date" is Date Signed (server-stamped at signing); "name" is the adopted full name (server-filled). */
export type SigningFieldType =
  "signature" | "initials" | "date" | "name" | "text";

/** Where to sign: placed on the rendered preview, one per required action. */
export type SigningField = {
  id: string;
  type: SigningFieldType;
  /** 1-indexed; always 1 for an image-origin version. */
  page: number;
  xPercent: number;
  yPercent: number;
  signerId: string;
  required: boolean;
  label?: string;
};

export type SigningRequestRecord = {
  documentId: string;
  /** The version being signed, pinned at creation so edits mid-flight can't swap the bytes. */
  sourceVersionId: string;
  title: string;
  mode: "ordered" | "parallel";
  createdBy: string;
  createdByName?: string;
  /** So a completion notice can reach the requester without a signups lookup by keycloak id. */
  createdByEmail?: string;
  createdAt: string;
  status: SigningRequestStatus;
  signers: Signer[];
  /** Set once, by the preparer, at start-signing time — never edited afterward. */
  fields?: SigningField[];
  completedAt?: string;
  /** New requests: the signed (stamped) PDF version. Old requests: the .txt completion record. */
  resultingVersionId?: string;
  /** sha256 of resultingVersionId's bytes. */
  sha256?: string;
  /** New requests only: the Certificate of Completion PDF version. */
  certificateVersionId?: string;
  certificateSha256?: string;
  /** True from the commit that completes it until the document has moved onto the signed copy and everyone has been emailed; reads retry that while it's set. */
  completionFollowUpPending?: boolean;
  /** Uppercase UUID shown on every stamped page and the certificate. Old rows: derive from the request id. */
  envelopeId?: string;
  events?: SigningEvent[];
  createdByIp?: string;
  cancelledAt?: string;
  cancelledBy?: string;
};

/** GET /api/documents/sign/[token] and GET /api/documents/signing/[id]/my-signature. */
export type SignerSessionView = {
  envelopeId: string;
  requestTitle: string;
  documentTitle: string;
  requesterName: string;
  requestStatus: "sent" | "completed" | "cancelled" | "declined";
  signer: {
    id: string;
    name?: string;
    email?: string;
    kind: "member" | "external";
    status: "pending" | "viewed" | "signed" | "declined";
    consentedAt?: string;
    signedAt?: string;
  };
  /** This signer's own fields only. */
  fields: SigningField[];
  /** Inline source PDF, same access check as today's /file routes. */
  fileUrl: string;
  canSign: boolean;
  /** e.g. "Waiting for Holly Young to sign first." when canSign is false. */
  waitingReason?: string;
  /** Present once the whole envelope is completed. */
  completed?: { signedFileUrl: string; certificateUrl: string };
};

/** POST body to the same two routes (and nothing else signs). Date, name and signature values are computed server-side. */
export type SignSubmission = {
  adopted: {
    fullName: string;
    initials: string;
    style: "typed" | "drawn";
    font?: SignatureFontId;
    /** data:image/png;base64,... drawn style only, <= 300KB decoded each. */
    signaturePng?: string;
    initialsPng?: string;
  };
  /** Text fields only, keyed by field id. */
  fieldValues: Record<string, string>;
};

export type SignResult = {
  signerStatus: "signed";
  requestStatus: "sent" | "completed";
  completed?: { signedFileUrl: string; certificateUrl: string };
};

/** GET /api/documents/signed/[token] — an external signer's read-only link to the completed envelope. */
export type CompletedEnvelopeView = {
  envelopeId: string;
  documentTitle: string;
  requestTitle: string;
  completedAt: string;
  signedFileUrl: string;
  certificateUrl: string;
};

export type PendingDocumentActionKind =
  | "upload"
  | "replace"
  | "delete"
  | "rename"
  | "start-signing"
  | "add-signer"
  | "remove-signer"
  | "cancel-signing";

type PendingDocumentActionStatus = "pending" | "approved" | "rejected";

export type UploadPayload = {
  title: string;
  description?: string;
  storedFilename: string;
  originalFilename: string;
  contentType: string;
  size: number;
  sha256: string;
};

export type ReplacePayload = {
  documentId: string;
  storedFilename: string;
  originalFilename: string;
  contentType: string;
  size: number;
  sha256: string;
  note?: string;
};

export type DeletePayload = { documentId: string };

/** An absent description is left as it is; null clears it. */
export type RenamePayload = {
  documentId: string;
  title: string;
  description?: string | null;
};

export type SignerInput =
  | { kind: "member"; signupId: string }
  | { kind: "external"; name: string; email: string };

/**
 * Signers don't have an id yet at this point (buildSigner assigns one when
 * the request is actually created) — reference the drafted signer by its
 * position in `StartSigningPayload.signers` instead.
 */
export type SigningFieldInput = {
  type: SigningFieldType;
  page: number;
  xPercent: number;
  yPercent: number;
  signerIndex: number;
  required: boolean;
  label?: string;
};

export type StartSigningPayload = {
  documentId: string;
  /** The version the proposer actually reviewed, pinned so a later replace can't swap it out from under a queued approval. */
  sourceVersionId: string;
  title: string;
  mode: "ordered" | "parallel";
  signers: SignerInput[];
  fields?: SigningFieldInput[];
};

export type AddSignerPayload = {
  signingRequestId: string;
  signer: SignerInput;
};

export type RemoveSignerPayload = {
  signingRequestId: string;
  signerId: string;
};

export type CancelSigningPayload = { signingRequestId: string };

export type PendingActionPayload =
  | UploadPayload
  | ReplacePayload
  | DeletePayload
  | RenamePayload
  | StartSigningPayload
  | AddSignerPayload
  | RemoveSignerPayload
  | CancelSigningPayload;

export type PendingDocumentActionRecord = {
  kind: PendingDocumentActionKind;
  proposedBy: string;
  proposedByName?: string;
  proposedByEmail?: string;
  proposedAt: string;
  payload: PendingActionPayload;
  status: PendingDocumentActionStatus;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  targetDocumentId?: string;
  targetSigningRequestId?: string;
};

export type EventRecord = {
  title?: string;
  presenter?: string;
  description?: string;
  location?: string;
  signupUrl?: string;
  googleFormUrl?: string;
  schedule?: {
    startDate?: string;
    endDate?: string;
    startTime?: string;
    endTime?: string;
    recurrence?: {
      interval?: number;
      unit?: "day" | "week" | "month";
      byWeekday?: number[];
    };
  };
  dscEvent?: boolean;
  resources?: Array<{
    name?: string;
    url?: string;
  }>;
  gallery?: Array<{
    name?: string;
    url?: string;
  }>;
  image?: {
    url?: string;
    name?: string;
    path?: string;
  };
};
