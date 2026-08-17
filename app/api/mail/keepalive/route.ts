import { NextResponse, type NextRequest } from "next/server";
import {
  REFRESH_COOKIE,
  exchangeRefreshToken,
  refreshCookieOptions,
} from "@/lib/auth/mail-token";
import { requireMember } from "@/lib/auth/session";

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
