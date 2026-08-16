/** firstname + lastname, accents folded, non-alphanumerics stripped. Shared by
 * the sign-up form and the server, so it must stay dependency-free; scripts that
 * fold away entirely are romanized server-side in the sign-up route. */

/** Distinct letters, not accented bases, so NFKD leaves them intact. */
const STANDALONE: Record<string, string> = {
  ł: "l",
  đ: "d",
  ð: "d",
  ø: "o",
  æ: "ae",
  œ: "oe",
  þ: "th",
  ß: "ss",
  ı: "i",
};

export const fold = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[łđðøæœþßı]/g, (char) => STANDALONE[char])
    .replace(/[^a-z0-9]/g, "");

export const usernameFor = (firstName: string, lastName: string): string =>
  fold(`${firstName}${lastName}`);

/** Alias form: alaqmar.gandhi reaches alaqmargandhi. Empty when either name
 * folds away, since a leading or trailing dot is not a valid local-part. */
export const dottedAliasFor = (firstName: string, lastName: string): string => {
  const first = fold(firstName);
  const last = fold(lastName);
  return first && last ? `${first}.${last}` : "";
};
