import { randomInt } from "node:crypto";

/** No 0/O/1/l/I — an admin may need to read this out loud or retype it. */
const TEMP_PASSWORD_ALPHABET =
  "23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";

export const generateTempPassword = (length = 12) =>
  Array.from(
    { length },
    () => TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)],
  ).join("");
