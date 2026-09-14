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

/** Local calendar date (not UTC — a signer at 9pm shouldn't get tomorrow's date). */
export const todayIsoLocal = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
