import type { SigningFieldType } from "@/lib/api/types";

/** Pure data shared by the field-type picker (client) and the certificate labels (server). */
export const SIGNING_FIELD_TYPES: { value: SigningFieldType; label: string }[] =
  [
    { value: "signature", label: "Signature" },
    { value: "date", label: "Date" },
    { value: "text", label: "Text" },
  ];

export const SIGNING_FIELD_DEFAULT_LABEL: Record<SigningFieldType, string> = {
  signature: "Signature",
  date: "Date",
  text: "Text",
};
