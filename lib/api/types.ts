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
    /** CSS object-position, e.g. "50% 25%". Keeps heads in frame when cropped. */
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

export type SignupStatus = "pending" | "approved" | "rejected";

export type SignupRecord = {
  firstName?: string;
  lastName?: string;
  username?: string;
  email?: string;
  phone?: string;
  studentId?: string;
  /** Alumni have no Brock email or student number any more. */
  isFormerExec?: boolean;
  keycloakUserId?: string;
  /** Shown once at sign-up; the approver checks it out-of-band. */
  confirmationCode?: string;
  status?: SignupStatus;
  /** Exec record this account is linked to once approved. Null once unlinked. */
  execKey?: string | null;
  submittedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
};

export type DashboardStats = {
  pageViews: {
    last30Days: number;
    previous30Days: number;
    topPaths: { path: string; views: number }[];
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
  pendingSignups: number | null;
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
  tentative?: boolean;
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
