import { isUsernameReserved } from "@/lib/db/identity-migrations";
import {
  adminGroup,
  coPresidentsList,
  isProtectedMailbox,
} from "@/lib/mail/provision";
import { SYSTEM_SENDER } from "@/lib/mail/signature";
import { aliasTaken, localPartTaken } from "@/lib/mail/stalwart";

/**
 * Local parts a name must never derive into: the RFC 2142 role addresses,
 * the ones public CAs accept for domain validation, and the club's own
 * service names. A member called "Host Master" gets hostmaster2.
 */
const DENIED = new Set([
  "abuse",
  "admin",
  "administrator",
  "ftp",
  "help",
  "hostmaster",
  "info",
  "it",
  "mail",
  "mailerdaemon",
  "marketing",
  "news",
  "noc",
  "noreply",
  "postmaster",
  "root",
  "sales",
  "security",
  "support",
  "sysadmin",
  "usenet",
  "uucp",
  "webmaster",
  "www",
]);

const deniedLocalPart = (candidate: string) =>
  DENIED.has(candidate) ||
  candidate === SYSTEM_SENDER ||
  candidate === coPresidentsList() ||
  candidate === adminGroup() ||
  isProtectedMailbox(candidate);

/**
 * Names a new username may not take: the deny-list above, retired local
 * parts and aliases, targets of renames in flight, and anything Stalwart
 * already answers to. Stalwart being down falls back to the table alone
 * rather than blocking sign-up.
 */
export const reservedForSignup = async (
  candidate: string,
): Promise<boolean> => {
  if (deniedLocalPart(candidate)) return true;
  if (await isUsernameReserved(candidate)) return true;
  try {
    return (await localPartTaken(candidate)) || (await aliasTaken(candidate));
  } catch (err) {
    console.warn(
      `could not ask Stalwart whether ${candidate} is taken; relying on retired_usernames: ${err instanceof Error ? err.message : err}`,
    );
    return false;
  }
};
