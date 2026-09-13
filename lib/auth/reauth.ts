import { NextResponse, type NextRequest } from "next/server";
import type { SessionUser, SignupRecord } from "@/lib/api/types";
import { rateLimit } from "@/lib/rate-limit";
import { exchangeCredentials } from "./keycloak";

const refused = (error: string) =>
  NextResponse.json({ error }, { status: 403 });

/**
 * Proves the caller knows their current password before an identity edit.
 * Its own bucket, keyed by sub: sharing the login limiter would let a
 * signed-in attacker spend the sign-in budget, or guess outside it. The
 * refresh token Keycloak hands back is dropped — this is a check, not a
 * sign-in.
 */
export const confirmCurrentPassword = async (
  req: NextRequest,
  user: SessionUser,
  signup: SignupRecord,
  password: string,
): Promise<NextResponse | null> => {
  const limited = rateLimit(req, "confirm-password", 5, 15 * 60_000, user.sub);
  if (limited) return limited;
  if (!signup.username) return refused("This account has no username.");
  const identity = await exchangeCredentials(signup.username, password);
  if (!identity || identity.sub !== user.sub) {
    return refused("That password is not right.");
  }
  return null;
};
