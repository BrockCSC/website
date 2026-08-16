import { NextResponse, type NextRequest } from "next/server";
import { exchangeCredentials } from "@/lib/auth/keycloak";
import { REFRESH_COOKIE, refreshCookieOptions } from "@/lib/auth/mail-token";
import { rateLimit } from "@/lib/rate-limit";
import { badJson, jsonObject } from "@/lib/json";
import {
  sessionCookieOptions,
  signSession,
  SESSION_COOKIE,
} from "@/lib/auth/session";

const {
  ADMIN_ROLE = "executive",
  ALUMNI_ROLE = "alumni",
  SUPERUSER_ROLE = "owner",
} = process.env;

export const POST = async (req: NextRequest) => {
  const limited = rateLimit(req, "login", 10, 15 * 60 * 1000);
  if (limited) return limited;

  const body = await jsonObject<{ username?: string; password?: string }>(req);
  if (!body) return badJson();
  const { username, password } = body;

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required" },
      { status: 400 },
    );
  }

  // The per-IP cap alone does nothing against one account guessed from many
  // addresses. Set above it, so a campus NAT hits the IP cap first.
  const guessed = rateLimit(
    req,
    "login-user",
    30,
    15 * 60 * 1000,
    username.toLowerCase(),
  );
  if (guessed) return guessed;

  const identity = await exchangeCredentials(username, password);
  if (!identity) {
    return NextResponse.json(
      { error: "Invalid username or password" },
      { status: 401 },
    );
  }

  if (
    !identity.roles.includes(ADMIN_ROLE) &&
    !identity.roles.includes(ALUMNI_ROLE) &&
    !identity.roles.includes(SUPERUSER_ROLE)
  ) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const response = NextResponse.json({
    sub: identity.sub,
    email: identity.email,
    name: identity.name,
    roles: identity.roles,
  });
  response.cookies.set(
    SESSION_COOKIE,
    signSession(identity),
    sessionCookieOptions,
  );
  if (identity.refreshToken) {
    response.cookies.set(
      REFRESH_COOKIE,
      identity.refreshToken,
      refreshCookieOptions,
    );
  }
  return response;
};
