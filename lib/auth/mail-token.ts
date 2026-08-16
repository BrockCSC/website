import type { NextRequest } from "next/server";

/**
 * Mail is read as the signed-in user, not as an admin, so Stalwart enforces
 * isolation. Access tokens live minutes and the session lives a day, so the
 * refresh token is what gets stored and access tokens are minted per request.
 */

export const REFRESH_COOKIE = "brockcsc_refresh";

export const refreshCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 24 * 60 * 60,
};

const config = () => {
  const { KEYCLOAK_ISSUER, KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET } =
    process.env;
  if (!KEYCLOAK_ISSUER || !KEYCLOAK_CLIENT_ID || !KEYCLOAK_CLIENT_SECRET) {
    throw new Error("Keycloak issuer/client id/secret are not set.");
  }
  return {
    issuer: KEYCLOAK_ISSUER,
    clientId: KEYCLOAK_CLIENT_ID,
    clientSecret: KEYCLOAK_CLIENT_SECRET,
  };
};

export const accessTokenFor = async (
  req: NextRequest,
): Promise<string | null> => {
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!refresh) return null;

  const { issuer, clientId, clientSecret } = config();
  const res = await fetch(`${issuer}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
    }),
  });
  if (!res.ok) return null;

  const { access_token } = (await res.json()) as { access_token?: string };
  return access_token ?? null;
};
