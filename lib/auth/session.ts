import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import type { SessionUser } from "@/lib/api/types";
import type { KeycloakIdentity } from "./keycloak";
import { effectiveRealmRoles } from "./keycloak-admin";

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

/**
 * Roles are read from Keycloak per request rather than from the session cookie,
 * so granting or revoking one takes effect immediately instead of at next login.
 * The short cache keeps a single page load to one lookup.
 */
const ROLE_CACHE_MS = 15_000;
const roleCache = new Map<string, { roles: string[]; readAt: number }>();

const liveRoles = async (sub: string): Promise<string[] | null> => {
  const cached = roleCache.get(sub);
  if (cached && Date.now() - cached.readAt < ROLE_CACHE_MS) {
    return cached.roles;
  }
  try {
    const roles = await effectiveRealmRoles(sub);
    roleCache.set(sub, { roles, readAt: Date.now() });
    return roles;
  } catch {
    // Fail closed: a revoked role must not survive a Keycloak outage.
    return null;
  }
};

/**
 * Holding the superuser role satisfies every check here, including ones added
 * after this was written. It is a realm role rather than a hardcoded account so
 * it stays revocable from Keycloak.
 */
const requireRole = async (
  req: NextRequest,
  role: string,
): Promise<SessionUser | null> => {
  const user = getSessionUser(req);
  if (!user) return null;
  const roles = await liveRoles(user.sub);
  if (!roles) return null;
  const superuser = process.env.SUPERUSER_ROLE ?? "owner";
  if (!roles.includes(role) && !roles.includes(superuser)) return null;
  return { ...user, roles };
};

export const requireAdmin = (req: NextRequest) =>
  requireRole(req, process.env.ADMIN_ROLE ?? "executive");

/**
 * Anyone with a linked profile: current execs and alumni. Alumni may edit
 * themselves and nothing else, so content routes keep using requireAdmin.
 */
export const requireMember = async (
  req: NextRequest,
): Promise<SessionUser | null> =>
  (await requireAdmin(req)) ??
  (await requireRole(req, process.env.ALUMNI_ROLE ?? "alumni"));

/** Approving sign-ups is gated separately; bundle this with co-president. */
export const requireApprover = (req: NextRequest) =>
  requireRole(req, process.env.APPROVER_ROLE ?? "brockcsc-approver");
