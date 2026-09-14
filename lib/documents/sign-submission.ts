import {
  SIGNATURE_FONT_IDS,
  type SignSubmission,
  type SignatureFontId,
  type SigningField,
} from "@/lib/api/types";
import { SigningError, sanitizeCertificateText } from "./envelope";
import { SIGNING_TIME_ZONE } from "./fields";

const MAX_FULL_NAME = 120;
const MAX_INITIALS = 8;
const MAX_TEXT_VALUE = 500;
const MAX_PNG_BYTES = 300 * 1024;
const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type ParsedSubmission = {
  fullName: string;
  initials: string;
  style: "typed" | "drawn";
  font?: SignatureFontId;
  signaturePng?: Uint8Array;
  initialsPng?: Uint8Array;
  /** Unfiltered; resolveFieldValues keeps only this signer's own text fields. */
  textValues: Record<string, unknown>;
};

const invalid = (message: string) => new SigningError(400, message);

const boundedText = (raw: unknown, max: number, what: string): string => {
  const clean = typeof raw === "string" ? sanitizeCertificateText(raw) : "";
  if (!clean) throw invalid(`Enter your ${what}.`);
  if ([...clean].length > max) {
    throw invalid(`Your ${what} can be at most ${max} characters.`);
  }
  return clean;
};

const decodePng = (raw: unknown, what: string): Uint8Array => {
  if (typeof raw !== "string" || !raw.startsWith(PNG_DATA_URL_PREFIX)) {
    throw invalid(`Draw your ${what} before signing.`);
  }
  const base64 = raw.slice(PNG_DATA_URL_PREFIX.length);
  if (base64.length > Math.ceil(MAX_PNG_BYTES / 3) * 4) {
    throw invalid(`Your drawn ${what} is too large. Clear it and draw again.`);
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw invalid(`Your drawn ${what} could not be read.`);
  }
  const bytes = Buffer.from(base64, "base64");
  if (bytes.byteLength > MAX_PNG_BYTES) {
    throw invalid(`Your drawn ${what} is too large. Clear it and draw again.`);
  }
  if (!PNG_MAGIC.every((byte, i) => bytes[i] === byte)) {
    throw invalid(`Your drawn ${what} is not a PNG image.`);
  }
  return new Uint8Array(bytes);
};

/** Shape and limits only; consent, turn and required fields are checked against the request. */
export const parseSignSubmission = (body: unknown): ParsedSubmission => {
  if (!body || typeof body !== "object") {
    throw invalid("Expected a JSON object.");
  }
  const { adopted, fieldValues } = body as {
    [K in keyof SignSubmission]?: unknown;
  };
  if (!adopted || typeof adopted !== "object") {
    throw invalid("Adopt a signature before signing.");
  }
  const a = adopted as Record<string, unknown>;
  const fullName = boundedText(a.fullName, MAX_FULL_NAME, "full name");
  const initials = boundedText(a.initials, MAX_INITIALS, "initials");
  const textValues =
    fieldValues &&
    typeof fieldValues === "object" &&
    !Array.isArray(fieldValues)
      ? (fieldValues as Record<string, unknown>)
      : {};

  if (a.style === "typed") {
    if (!SIGNATURE_FONT_IDS.includes(a.font as SignatureFontId)) {
      throw invalid("Pick a signature style.");
    }
    return {
      fullName,
      initials,
      style: "typed",
      font: a.font as SignatureFontId,
      textValues,
    };
  }
  if (a.style === "drawn") {
    return {
      fullName,
      initials,
      style: "drawn",
      signaturePng: decodePng(a.signaturePng, "signature"),
      initialsPng: decodePng(a.initialsPng, "initials"),
      textValues,
    };
  }
  throw invalid("Pick a signature style.");
};

/** e.g. 9/14/2026, in the club's time zone rather than the server's. */
const formatSignedDate = (iso: string): string =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: SIGNING_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(new Date(iso));

/**
 * Only text fields take a submitted value. Date Signed and Name come from the
 * server and the adopted name, so a signer can never backdate or rename.
 */
export const resolveFieldValues = (
  mine: SigningField[],
  submission: ParsedSubmission,
  signedAt: string,
): Record<string, string> => {
  const values: Record<string, string> = {};
  for (const field of mine) {
    if (field.type === "date") {
      values[field.id] = formatSignedDate(signedAt);
    } else if (field.type === "name") {
      values[field.id] = submission.fullName;
    } else if (field.type === "signature" || field.type === "initials") {
      values[field.id] = "adopted";
    } else {
      const raw = submission.textValues[field.id];
      const clean =
        typeof raw === "string"
          ? [...sanitizeCertificateText(raw)]
              .slice(0, MAX_TEXT_VALUE)
              .join("")
              .trim()
          : "";
      if (clean) values[field.id] = clean;
      else if (field.required) {
        throw invalid("Fill in every required field before signing.");
      }
    }
  }
  return values;
};
