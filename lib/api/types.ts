export type WithKey<T> = T & { $key: string };

export type SessionUser = {
  sub: string;
  email: string;
  name: string;
  roles: string[];
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
  term?: string;
  socials?: ExecSocialLinks;
  image?: {
    url?: string;
    name?: string;
    path?: string;
  };
};

export type SignupInput = {
  inviteCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
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
  keycloakUserId?: string;
  status?: SignupStatus;
  /** Exec record this account is linked to once approved. */
  execKey?: string;
  submittedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
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
