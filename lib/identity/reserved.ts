import { isUsernameReserved } from "@/lib/db/identity-migrations";
import { aliasTaken, localPartTaken } from "@/lib/mail/stalwart";

/**
 * Names a new username may not take: retired local parts, targets of renames
 * in flight, and anything Stalwart already answers to. Stalwart being down
 * falls back to the table alone rather than blocking sign-up.
 */
export const reservedForSignup = async (
  candidate: string,
): Promise<boolean> => {
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
