import type { SignSubmission, SigningField } from "@/lib/api/types";
import { SIGNER_INPUT_FIELD_TYPES } from "@/lib/documents/fields";

export type AdoptedDraft = SignSubmission["adopted"];

/** Every Sign and Initial tag is stamped on submit, so each needs a click whatever its required flag. */
export const needsSignerAction = (field: SigningField) =>
  SIGNER_INPUT_FIELD_TYPES.includes(field.type) &&
  (field.type !== "text" || field.required);

export const initialsFrom = (name: string) => {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (!words.length) return "";
  const picked =
    words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]];
  return picked
    .map((word) => word[0])
    .join("")
    .toUpperCase();
};

export const byDocumentOrder = (a: SigningField, b: SigningField) =>
  a.page - b.page || a.yPercent - b.yPercent || a.xPercent - b.xPercent;
