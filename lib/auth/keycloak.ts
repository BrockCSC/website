import jwt from "jsonwebtoken";

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
};

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

  const tokenResponse = await fetch(
    `${KEYCLOAK_ISSUER}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: KEYCLOAK_CLIENT_ID!,
        client_secret: KEYCLOAK_CLIENT_SECRET!,
        scope: "openid",
        username,
        password,
      }),
    },
  );

  if (!tokenResponse.ok) {
    return null;
  }

  const { access_token } = (await tokenResponse.json()) as {
    access_token: string;
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
  };
};
