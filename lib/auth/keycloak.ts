import jwt from "jsonwebtoken";
import { tokenRequest } from "./keycloak-token";

type KeycloakTokenPayload = {
  sub: string;
  email: string;
  name: string;
  realm_access?: { roles?: string[] };
};

export type KeycloakIdentity = {
  sub: string;
  email: string;
  name: string;
  roles: string[];
  /** Kept so mail can be read as this user rather than as an admin. */
  refreshToken?: string;
};

/**
 * "offline_access" gets back an offline refresh token, governed by Keycloak's
 * Offline Session Idle/Max (realm default: weeks), instead of the regular SSO
 * Session Idle (ours: 30 minutes) that a plain refresh token is bound to.
 * That's what let the mail session (see lib/auth/mail-token.ts) outlive a
 * short gap in the keepalive heartbeat. Falls back to a plain token if the
 * client isn't set up for it, so a missing scope can never break login.
 */
export const exchangeCredentials = async (
  username: string,
  password: string,
): Promise<KeycloakIdentity | null> => {
  const { KEYCLOAK_ISSUER, KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET } =
    process.env;

  for (const [name, value] of Object.entries({
    KEYCLOAK_ISSUER,
    KEYCLOAK_CLIENT_ID,
    KEYCLOAK_CLIENT_SECRET,
  })) {
    if (!value) throw new Error(`${name} env var is not set.`);
  }

  const request = (scope: string) =>
    tokenRequest(KEYCLOAK_ISSUER!, {
      grant_type: "password",
      client_id: KEYCLOAK_CLIENT_ID!,
      client_secret: KEYCLOAK_CLIENT_SECRET!,
      scope,
      username,
      password,
    });

  let tokenResponse = await request("openid offline_access");
  if (!tokenResponse.ok) {
    const body = await tokenResponse.text().catch(() => "");
    // Wrong username/password fails identically either way - only the scope
    // itself being unavailable (invalid_scope) is worth a fallback attempt.
    if (tokenResponse.status === 400 && /invalid_scope/.test(body)) {
      console.warn(
        `Keycloak refused "offline_access": ${body.slice(0, 300)}. Falling back ` +
          "to a regular token - mail sign-in will still time out after the SSO idle " +
          'window. Check that "Offline Access" is an assigned client scope for this client.',
      );
      tokenResponse = await request("openid");
    }
  }

  if (!tokenResponse.ok) {
    return null;
  }

  const { access_token, refresh_token } = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token?: string;
  };

  // Not re-verifying: token comes straight from Keycloak over TLS.
  const payload = jwt.decode(access_token) as KeycloakTokenPayload | null;
  if (!payload) {
    return null;
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    roles: payload.realm_access?.roles ?? [],
    refreshToken: refresh_token,
  };
};
