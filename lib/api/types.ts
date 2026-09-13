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
  /** Usernames this account held before, oldest first. Never reissued. */
  previousUsernames?: string[];
  /** The rename that last moved this account, for the audit trail. */
  identityMigrationId?: string;
};

export type PasswordResetRecord = {
  signupId: string;
  /** sha256 of the raw token mailed to the user; the raw value is never stored. */
  tokenHash: string;
  expiresAt: string;
};

/**
 * A local part that used to be someone's username. It stays an alias on the
 * successor mailbox until forwardUntil, then the sweep detaches it. The local
 * part itself is never handed to anyone else.
 */
export type RetiredUsernameRecord = {
  localPart: string;
  /** Other aliases the old account carried; they follow the successor too. */
  aliases: string[];
  signupId: string;
  successor: string;
  migrationId: string;
  retiredAt: string;
  forwardUntil: string;
  sweptAt?: string;
};

export type MigrationMode = "real" | "rehearsal";

export type MigrationStatus =
  "planned" | "running" | "cut-over" | "failed" | "done" | "aborted";

export type MigrationStepStatus =
  "pending" | "done" | "failed" | "skipped" | "rehearsed";

export type MigrationStepState = {
  status: MigrationStepStatus;
  at?: string;
  attempts: number;
  error?: string;
};

export type MigrationMailbox = {
  name: string;
  role: string | null;
  parentId: string | null;
  newId?: string;
  cursor: number;
  old: { total: number; unread: number };
};

export type MigrationVerification = {
  at: string;
  ok: boolean;
  /** Per old folder: [total, unread, bytes] on each side. */
  folders: Record<
    string,
    { name: string; old: [number, number, number]; new: [number, number] }
  >;
  messagesChecked: number;
  keywordMismatches: number;
  receivedAtMismatches: number;
  otherMismatches: number;
  sieveOk: boolean;
  rolesOk: boolean;
  aliasesOk: boolean;
  senderOk: boolean;
  notes: string[];
};

export type IdentityMigrationRecord = {
  signupId: string;
  mode: MigrationMode;
  requestedBy: { sub: string; kind: "self" | "approver" };
  requestedAt: string;
  /** confirmed: the member's own password, held in memory only. temp: a generated one they must change. */
  passwordSource: "confirmed" | "temp";
  from: {
    username: string;
    keycloakUserId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    mailboxId: string | null;
    aliases: string[];
    readOnly: boolean;
    appPasswords: { description: string; createdAt: string }[];
  };
  to: {
    username: string;
    keycloakUserId?: string;
    firstName: string;
    lastName: string;
    email: string;
    mailboxId?: string;
    dottedAlias: string | null;
  };
  status: MigrationStatus;
  step: string;
  lease?: { until: string; by: string };
  steps: Record<string, MigrationStepState>;
  /** Old mailbox id -> its counterpart on the new account. */
  mailboxes: Record<string, MigrationMailbox>;
  /** Old Email id -> new Email id. */
  copied: Record<string, string>;
  sieve: { name: string; isActive: boolean; newId?: string }[];
  roles: { direct: string[]; effectiveBefore: string[] };
  lists: { id: string; name: string; updated: boolean }[];
  verification?: MigrationVerification;
  cutOverAt?: string;
  forwardUntil?: string;
  handoff?: { at: string; how: "session" | "relogin" };
  notified: Partial<
    Record<"requested" | "cutover" | "done" | "failed", string>
  >;
  error?: string;
};

/** What the browser sees of a migration: no ids, no copied map. */
export type IdentityMigrationView = {
  $key: string;
  signupId: string;
  mode: MigrationMode;
  status: MigrationStatus;
  step: string;
  requestedAt: string;
  requestedBy: "self" | "approver";
  passwordSource: "confirmed" | "temp";
  from: string;
  to: string;
  cutOverAt?: string;
  forwardUntil?: string;
  handoff?: { at: string; how: "session" | "relogin" };
  verification?: MigrationVerification;
  error?: string;
  steps: ({
    id: string;
    label: string;
    phase: "A" | "B" | "C";
  } & MigrationStepState)[];
  messages: { copied: number; total: number };
  leaseExpired: boolean;
  canAbort: boolean;
  canResume: boolean;
};

/** One line of the rename confirmation. Every item is fixed: there is nothing to untick. */
export type RenamePreviewItem = {
  id: string;
  title: string;
  detail: string;
  fixed: true;
};

export type RenamePreview = {
  preview: RenamePreviewItem[];
  to: string;
  rehearsal: boolean;
};

export type PreflightCheck = {
  id: string;
  label: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
};

export type PreflightReport = {
  at: string;
  ok: boolean;
  checks: PreflightCheck[];
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
