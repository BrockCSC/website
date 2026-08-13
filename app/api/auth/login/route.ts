import { NextResponse, type NextRequest } from "next/server";
import { exchangeCredentials } from "@/lib/auth/keycloak";
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
  const { username, password } = (await req.json()) as {
    username?: string;
    password?: string;
  };

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required" },
      { status: 400 },
    );
  }

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
  return response;
};
