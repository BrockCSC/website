import type { SignupRecord } from "@/lib/api/types";
import { findAll } from "./repository";
import { signupsTable } from "./schema";

/** Keycloak `sub` is the stable identity; usernames can be changed in Keycloak. */
export const findSignupByUserId = async (keycloakUserId: string) =>
  (await findAll<SignupRecord>(signupsTable)).find(
    (signup) => signup.keycloakUserId === keycloakUserId,
  ) ?? null;

export const findSignupByExecKey = async (execKey: string) =>
  (await findAll<SignupRecord>(signupsTable)).find(
    (signup) => signup.execKey === execKey,
  ) ?? null;

/**
 * Matches on the personal signup email or the derived club address, so
 * "forgot password" works with either. Skips rejected rows — app/api/signup
 * already treats those as not blocking a fresh signup, for the same reason.
 */
export const findSignupByEmail = async (email: string) => {
  const wanted = email.trim().toLowerCase();
  if (!wanted) return null;
  const domain = process.env.MAIL_DOMAIN ?? "brockcsc.ca";

  return (
    (await findAll<SignupRecord>(signupsTable)).find((signup) => {
      if (signup.status === "rejected") return false;
      const clubAddress = signup.username
        ? `${signup.username}@${domain}`.toLowerCase()
        : null;
      return signup.email?.toLowerCase() === wanted || clubAddress === wanted;
    }) ?? null
  );
};
