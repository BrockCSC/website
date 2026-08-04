import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import type { SessionUser } from "@/lib/api/types";
import type { KeycloakIdentity } from "./keycloak";

const getSessionSecret = (): string => {
  const { SESSION_JWT_SECRET } = process.env;
  if (!SESSION_JWT_SECRET) {
    throw new Error("SESSION_JWT_SECRET env var is not set.");
  }
  return SESSION_JWT_SECRET;
};

export const SESSION_COOKIE = "brockcsc_session";

export const sessionCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 24 * 60 * 60,
};

export const signSession = (identity: KeycloakIdentity): string => {
  const session: SessionUser = {
    sub: identity.sub,
    email: identity.email,
    name: identity.name,
    roles: identity.roles,
  };
  return jwt.sign(session, getSessionSecret(), { expiresIn: "1d" });
};

export const getSessionUser = (req: NextRequest): SessionUser | null => {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return jwt.verify(token, getSessionSecret()) as SessionUser;
  } catch {
    return null;
  }
};

export const requireAdmin = (req: NextRequest): SessionUser | null => {
  const user = getSessionUser(req);
  const adminRole = process.env.ADMIN_ROLE ?? "brockcsc-admin";
  if (!user || !user.roles.includes(adminRole)) return null;
  return user;
};
