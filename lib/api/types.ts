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

/** Free-text; the 3 bank-checklist categories are offered as quick-create shortcuts. */
export type DocumentRecord = {
  category: string;
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
  /** Cleared once spent (signed/declined) or on cancel/resend rotation. */
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
};

type SigningRequestStatus =
  "draft" | "sent" | "completed" | "cancelled" | "declined";

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
  completedAt?: string;
  resultingVersionId?: string;
  /** sha256 of the resulting completion record, for tamper detection only. */
  sha256?: string;
  cancelledAt?: string;
  cancelledBy?: string;
};

export type PendingDocumentActionKind =
  | "upload"
  | "replace"
  | "delete"
  | "start-signing"
  | "add-signer"
  | "remove-signer"
  | "cancel-signing";

type PendingDocumentActionStatus = "pending" | "approved" | "rejected";

export type UploadPayload = {
  category: string;
  title: string;
  description?: string;
  storedFilename: string;
  originalFilename: string;
  contentType: string;
  size: number;
  sha256: string;
  /** Set when this came from POST /api/documents/from-template rather than a real upload. */
  note?: string;
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

export type SignerInput =
  | { kind: "member"; signupId: string }
  | { kind: "external"; name: string; email: string };

export type StartSigningPayload = {
  documentId: string;
  /** The version the proposer actually reviewed, pinned so a later replace can't swap it out from under a queued approval. */
  sourceVersionId: string;
  title: string;
  mode: "ordered" | "parallel";
  signers: SignerInput[];
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
