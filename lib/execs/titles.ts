/** Titles a new executive can be given. */
export const ACTIVE_TITLES = ["Co-President", "Treasurer", "Executive"];

/** Held by past execs only. Kept so historical records read correctly. */
const DEPRECATED_TITLES = ["President", "Vice President"];

export const isDeprecatedTitle = (title?: string) =>
  DEPRECATED_TITLES.some(
    (t) => t.toLowerCase() === title?.trim().toLowerCase(),
  );

/**
 * Only co-president carries approval rights. President is deprecated, and
 * granting from it would let any of the past presidents approve sign-ups.
 */
export const grantsApproval = (title?: string) =>
  title?.trim().toLowerCase() === "co-president";
