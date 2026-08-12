import { createHmac, timingSafeEqual } from "node:crypto";

const PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

const secret = (): string => {
  const { INVITE_CODE_SECRET } = process.env;
  if (!INVITE_CODE_SECRET) {
    throw new Error("INVITE_CODE_SECRET env var is not set.");
  }
  return INVITE_CODE_SECRET;
};

const periodAt = (now: number) => Math.floor(now / PERIOD_MS);

const codeForPeriod = (period: number): string =>
  createHmac("sha256", secret())
    .update(String(period))
    .digest("base64url")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 8)
    .toUpperCase();

export const currentInviteCode = (now = Date.now()): string =>
  codeForPeriod(periodAt(now));

/** Ms until the current code rotates, so the admin panel can show an expiry. */
export const inviteCodeExpiresIn = (now = Date.now()): number =>
  (periodAt(now) + 1) * PERIOD_MS - now;

const matches = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/** Accepts the previous period too, so a code shared near rollover still works. */
export const isValidInviteCode = (input: string, now = Date.now()): boolean => {
  const given = input.trim().toUpperCase();
  if (!given) return false;
  const period = periodAt(now);
  return (
    matches(given, codeForPeriod(period)) ||
    matches(given, codeForPeriod(period - 1))
  );
};
