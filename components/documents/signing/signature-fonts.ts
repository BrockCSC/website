import {
  Caveat,
  Dancing_Script,
  Great_Vibes,
  Homemade_Apple,
} from "next/font/google";
import type { SignatureFontId } from "@/lib/api/types";

const dancingScript = Dancing_Script({ subsets: ["latin"], display: "swap" });
const greatVibes = Great_Vibes({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});
const caveat = Caveat({ subsets: ["latin"], display: "swap" });
const homemadeApple = Homemade_Apple({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

export const SIGNATURE_FONT_FAMILY: Record<SignatureFontId, string> = {
  "dancing-script": dancingScript.style.fontFamily,
  "great-vibes": greatVibes.style.fontFamily,
  caveat: caveat.style.fontFamily,
  "homemade-apple": homemadeApple.style.fontFamily,
};

/** The stamped PDF's ink, identical in both themes: the page behind it is always white. */
export const SIGNATURE_INK = "#1b2a4e";
