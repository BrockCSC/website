import type { ExecSocialLinks } from "@/lib/api/types";

export type SocialKey = keyof ExecSocialLinks;

type Platform = {
  key: SocialKey;
  label: string;
  /** Shown as a fixed prefix so the stored value is always a real URL. */
  prefix: string;
  base: string;
  /** Hosts accepted when parsing an existing value back into a handle. */
  hosts: string[];
  pattern: RegExp;
  hint: string;
};

export const SOCIAL_PLATFORMS: Platform[] = [
  {
    key: "github",
    label: "GitHub",
    prefix: "github.com/",
    base: "https://github.com/",
    hosts: ["github.com", "www.github.com"],
    pattern: /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/,
    hint: "Letters, numbers and dashes.",
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    prefix: "linkedin.com/in/",
    base: "https://www.linkedin.com/in/",
    hosts: ["linkedin.com", "www.linkedin.com"],
    pattern: /^[A-Za-z0-9-]{3,100}$/,
    hint: "The part after /in/ in your profile URL.",
  },
  {
    key: "instagram",
    label: "Instagram",
    prefix: "instagram.com/",
    base: "https://www.instagram.com/",
    hosts: ["instagram.com", "www.instagram.com"],
    pattern: /^[A-Za-z0-9._]{1,30}$/,
    hint: "Letters, numbers, dots and underscores.",
  },
  {
    key: "x",
    label: "X",
    prefix: "x.com/",
    base: "https://x.com/",
    hosts: ["x.com", "www.x.com", "twitter.com", "www.twitter.com"],
    pattern: /^[A-Za-z0-9_]{1,15}$/,
    hint: "Letters, numbers and underscores.",
  },
];

export const platformFor = (key: SocialKey) =>
  SOCIAL_PLATFORMS.find((p) => p.key === key)!;

/** Pulls the handle out of a stored URL so the form can show just that. */
export const handleFromUrl = (key: SocialKey, value?: string): string => {
  const raw = value?.trim();
  if (!raw) return "";
  const platform = platformFor(key);
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (!platform.hosts.includes(url.hostname.toLowerCase())) return "";
    const segments = url.pathname.split("/").filter(Boolean);
    return (key === "linkedin" ? segments[1] : segments[0]) ?? "";
  } catch {
    // Already a bare handle.
    return raw.replace(/^@/, "");
  }
};

export const isValidHandle = (key: SocialKey, handle: string): boolean =>
  platformFor(key).pattern.test(handle);

export const urlFromHandle = (key: SocialKey, handle: string): string => {
  const clean = handle.trim().replace(/^@/, "");
  return clean ? `${platformFor(key).base}${clean}` : "";
};

/** Server-side guard: keeps anything that isn't a real platform URL out of the DB. */
export const sanitiseSocials = (input?: ExecSocialLinks): ExecSocialLinks => {
  const result: ExecSocialLinks = {};
  for (const { key } of SOCIAL_PLATFORMS) {
    const handle = handleFromUrl(key, input?.[key]);
    result[key] =
      handle && isValidHandle(key, handle) ? urlFromHandle(key, handle) : "";
  }
  return result;
};
