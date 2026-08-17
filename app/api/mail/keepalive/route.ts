import { NextResponse, type NextRequest } from "next/server";
import {
  REFRESH_COOKIE,
  exchangeRefreshToken,
  refreshCookieOptions,
} from "@/lib/auth/mail-token";
import { requireMember } from "@/lib/auth/session";

/**
 * Keycloak drops a session that goes idle for longer than the dashboard cookie
 * lives, which used to strand mail behind a still-valid login. Exchanging the
 * refresh token resets that idle timer, so the client calls this on a timer and
 * whenever the tab is looked at again.
 */
export const POST = async (req: NextRequest) => {
  if (!(await requireMember(req))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const tokens = await exchangeRefreshToken(req);
  if (!tokens) {
    return NextResponse.json({ error: "Sign in again" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  if (tokens.refreshToken) {
    response.cookies.set(
      REFRESH_COOKIE,
      tokens.refreshToken,
      refreshCookieOptions,
    );
  }
  return response;
};
