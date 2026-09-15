import type { ExecRecord } from "@/lib/api/types";
import { sanitiseSocials } from "./socials";
import { isValidTerm, termFields } from "./terms";

const MAX_DESCRIPTION = 2000;
/** Only images this app stored. */
const UPLOAD_URL = /^\/uploads\/[A-Za-z0-9/._-]+$/;
const OBJECT_POSITION = /^\d{1,3}(?:\.\d+)?% \d{1,3}(?:\.\d+)?%$/;

/** Non-strings break .trim() on the team page. */
const isText = (value: unknown) =>
  value === undefined || typeof value === "string";

export const asBool = (value: unknown) =>
  value === undefined ? undefined : value === true;

/**
 * Normalises the fields anyone with write access may set. Omitted keys stay
 * omitted, so a partial patch never clears a field it did not name.
 */
export const cleanExec = (
  body: ExecRecord,
  /** Terms already on this tile: they stay allowed, so a value the picker no longer offers can't block an unrelated save. */
  known: string[] = [],
): { error: string } | { patch: Partial<ExecRecord> } => {
  if (
    !isText(body.name) ||
    !isText(body.title) ||
    !isText(body.description) ||
    !isText(body.image?.url) ||
    !isText(body.image?.position)
  ) {
    return { error: "Expected text." };
  }
  if ((body.description?.length ?? 0) > MAX_DESCRIPTION) {
    return { error: "That bio is too long." };
  }
  const rawTerms = body.terms;
  if (
    rawTerms !== undefined &&
    (!Array.isArray(rawTerms) || rawTerms.some((t) => typeof t !== "string"))
  ) {
    return { error: "Expected a list of terms." };
  }
  // `term` is derived from this list, never taken from the request: a page loaded before
  // lists existed sends only `term`, and honouring it would collapse the list to one entry.
  const listed = rawTerms && termFields(rawTerms);
  if (
    listed &&
    listed.terms.some((t) => !isValidTerm(t) && !known.includes(t))
  ) {
    return { error: "Unknown term." };
  }

  const url = body.image?.url?.trim() ?? "";
  if (url && !UPLOAD_URL.test(url)) {
    return { error: "Photos must be uploaded here rather than linked." };
  }
  const position = body.image?.position ?? "";

  return {
    patch: {
      description: body.description,
      ...(listed ?? {}),
      // sanitiseSocials fills in every platform, so absent must skip it.
      socials:
        body.socials === undefined ? undefined : sanitiseSocials(body.socials),
      image: body.image && {
        url,
        position: OBJECT_POSITION.test(position) ? position : "50% 50%",
      },
      hidden: asBool(body.hidden),
    },
  };
};
