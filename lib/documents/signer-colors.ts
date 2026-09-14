/**
 * Each takes white text at 4.5:1 or better and stays at 3:1 or better against
 * both the white PDF page and the dark theme's surface.
 */
const SIGNER_COLORS = [
  "#2563eb",
  "#c2410c",
  "#047857",
  "#9333ea",
  "#db2777",
  "#0e7490",
  "#4d7c0f",
  "#78716c",
];

/** Keyed by signer position, which is also the stored Signer.order. */
export const signerColor = (index: number): string =>
  SIGNER_COLORS[index % SIGNER_COLORS.length];
