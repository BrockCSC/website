import type { ExecRecord } from "@/lib/api/types";
import { sanitiseSocials } from "./socials";
import { isValidTerm } from "./terms";

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
): { error: string } | { patch: Partial<ExecRecord> } => {
  if (
    !isText(body.name) ||
    !isText(body.title) ||
    !isText(body.description) ||
    !isText(body.term) ||
    !isText(body.image?.url) ||
    !isText(body.image?.position)
  ) {
    return { error: "Expected text." };
  }
  if ((body.description?.length ?? 0) > MAX_DESCRIPTION) {
    return { error: "That bio is too long." };
  }
  if (body.term && !isValidTerm(body.term)) {
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
      term: body.term,
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
