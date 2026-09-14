import type { SignatureFontId, SigningFieldType } from "@/lib/api/types";

/** Pure data shared by the field-type picker (client) and the certificate labels (server). */
export const SIGNING_FIELD_TYPES: { value: SigningFieldType; label: string }[] =
  [
    { value: "signature", label: "Signature" },
    { value: "initials", label: "Initials" },
    { value: "date", label: "Date Signed" },
    { value: "name", label: "Name" },
    { value: "text", label: "Text" },
  ];

export const SIGNING_FIELD_DEFAULT_LABEL: Record<SigningFieldType, string> = {
  signature: "Signature",
  initials: "Initials",
  date: "Date Signed",
  name: "Name",
  text: "Text",
};

/** Filled by the signer; the rest are computed by the server at signing time. */
export const SIGNER_INPUT_FIELD_TYPES: SigningFieldType[] = [
  "signature",
  "initials",
  "text",
];

/** Same ids in next/font/google (client) and the bundled TTFs under lib/documents/fonts (server stamping). */
export const SIGNATURE_FONTS: {
  id: SignatureFontId;
  label: string;
  googleFamily: string;
  ttfFile: string;
}[] = [
  {
    id: "dancing-script",
    label: "Dancing Script",
    googleFamily: "Dancing Script",
    ttfFile: "DancingScript-Regular.ttf",
  },
  {
    id: "great-vibes",
    label: "Great Vibes",
    googleFamily: "Great Vibes",
    ttfFile: "GreatVibes-Regular.ttf",
  },
  {
    id: "caveat",
    label: "Caveat",
    googleFamily: "Caveat",
    ttfFile: "Caveat-Regular.ttf",
  },
  {
    id: "homemade-apple",
    label: "Homemade Apple",
    googleFamily: "Homemade Apple",
    ttfFile: "HomemadeApple-Regular.ttf",
  },
];

/** Stamped dates and certificate timestamps are shown in the club's local time. */
export const SIGNING_TIME_ZONE = "America/Toronto";

export const MAX_SIGNERS = 25;
