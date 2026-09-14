/**
 * Keycloak Admin REST API client.
 *
 * Uses a client_credentials service account, which must hold the
 * realm-management `manage-users` and `view-realm` roles. Configure via
 * KEYCLOAK_ADMIN_CLIENT_ID / KEYCLOAK_ADMIN_CLIENT_SECRET; falls back to the
 * login client when they are not set separately.
 */

import { tokenRequest } from "./keycloak-token";

type NewKeycloakUser = {
  username: string;
  email?: string;
  firstName: string;
  lastName: string;
  password: string;
  attributes?: Record<string, string[]>;
};

const config = () => {
  const {
    KEYCLOAK_ISSUER,
    KEYCLOAK_CLIENT_ID,
    KEYCLOAK_CLIENT_SECRET,
    KEYCLOAK_ADMIN_CLIENT_ID,
    KEYCLOAK_ADMIN_CLIENT_SECRET,
  } = process.env;

  if (!KEYCLOAK_ISSUER) {
    throw new Error("KEYCLOAK_ISSUER env var is not set.");
  }
  const clientId = KEYCLOAK_ADMIN_CLIENT_ID ?? KEYCLOAK_CLIENT_ID;
  const clientSecret = KEYCLOAK_ADMIN_CLIENT_SECRET ?? KEYCLOAK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Keycloak admin client id/secret are not set.");
  }

  // https://host/realms/<realm> -> https://host/admin/realms/<realm>
  const adminBase = KEYCLOAK_ISSUER.replace("/realms/", "/admin/realms/");
  return { issuer: KEYCLOAK_ISSUER, adminBase, clientId, clientSecret };
};

const adminToken = async (): Promise<string> => {
  const { issuer, clientId, clientSecret } = config();
  const res = await tokenRequest(issuer, {
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  if (!res.ok) {
    throw new Error(
      `Keycloak service account token failed (${res.status}). Check that the client has service accounts enabled.`,
    );
  }
  const { access_token } = (await res.json()) as { access_token: string };
  return access_token;
};

/** Ids reach these paths from tokens and the database; never let one add a segment. */
const userPath = (userId: string, suffix = "") =>
  `/users/${encodeURIComponent(userId)}${suffix}`;

const adminFetch = async (path: string, init: RequestInit = {}) => {
  const { adminBase } = config();
  const token = await adminToken();
  const res = await fetch(`${adminBase}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });
  if (res.status === 403) {
    throw new Error(
      "Keycloak returned 403. The service account is missing the realm-management `manage-users` role.",
    );
  }
  return res;
};

export const findUserByUsername = async (
  username: string,
): Promise<{ id: string; enabled: boolean } | null> => {
  const res = await adminFetch(
    `/users?username=${encodeURIComponent(username)}&exact=true`,
  );
  if (!res.ok) throw new Error(`Keycloak user lookup failed (${res.status}).`);
  const users = (await res.json()) as { id: string; enabled: boolean }[];
  return users[0] ?? null;
};

/** First free of base, base2, base3... `reserved` rules out retired mailbox
 * local-parts, which outlive their Keycloak user and must never be reissued. */
export const allocateUsername = async (
  base: string,
  reserved: (candidate: string) => Promise<boolean> = async () => false,
): Promise<string> => {
  for (let suffix = 1; suffix <= 50; suffix++) {
    const candidate = suffix === 1 ? base : `${base}${suffix}`;
    if (
      !(await findUserByUsername(candidate)) &&
      !(await reserved(candidate))
    ) {
      return candidate;
    }
  }
  throw new Error(`Could not allocate a username from "${base}".`);
};

/** Creates a disabled user. Approval enables it; the password never touches our DB. */
export const createDisabledUser = async (
  user: NewKeycloakUser,
): Promise<string> => {
  const res = await adminFetch("/users", {
    method: "POST",
    body: JSON.stringify({
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      enabled: false,
      emailVerified: false,
      attributes: user.attributes,
      credentials: [
        { type: "password", value: user.password, temporary: false },
      ],
    }),
  });

  if (res.status === 409) {
    throw new Error("That username is already taken.");
  }
  if (!res.ok) {
    throw new Error(`Keycloak user creation failed (${res.status}).`);
  }

  const location = res.headers.get("location");
  const id = location?.split("/").pop();
  if (!id) throw new Error("Keycloak did not return a user id.");
  return id;
};

export type KeycloakUser = {
  id: string;
  username: string;
  enabled: boolean;
  emailVerified?: boolean;
  firstName?: string;
  lastName?: string;
  email?: string;
  attributes?: Record<string, string[]>;
};

export const getUser = async (userId: string): Promise<KeycloakUser | null> => {
  const res = await adminFetch(userPath(userId));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Keycloak user read failed (${res.status}).`);
  return (await res.json()) as KeycloakUser;
};

const namesAt = async (path: string, failure: string): Promise<string[]> => {
  const res = await adminFetch(path);
  if (!res.ok) throw new Error(`${failure} (${res.status}).`);
  const rows = (await res.json()) as { name: string }[];
  return rows.map((row) => row.name);
};

/** Effective realm roles, including those inherited from groups and composites. */
export const effectiveRealmRoles = (userId: string): Promise<string[]> =>
  namesAt(
    userPath(userId, "/role-mappings/realm/composite"),
    "Keycloak role lookup failed",
  );

/**
 * Only the mappings on the user itself. Replaying the composite set onto a
 * new user would pin co-president's implied roles as direct mappings, and a
 * later single-role revoke would no longer remove them.
 */
export const directRealmRoles = (userId: string): Promise<string[]> =>
  namesAt(
    userPath(userId, "/role-mappings/realm"),
    "Keycloak direct role lookup failed",
  );

export const credentialTypes = async (userId: string): Promise<string[]> => {
  const res = await adminFetch(userPath(userId, "/credentials"));
  if (!res.ok) {
    throw new Error(`Keycloak credential lookup failed (${res.status}).`);
  }
  const rows = (await res.json()) as { type: string }[];
  return rows.map((row) => row.type);
};

export const federatedIdentities = async (
  userId: string,
): Promise<string[]> => {
  const res = await adminFetch(userPath(userId, "/federated-identity"));
  if (!res.ok) {
    throw new Error(
      `Keycloak federated identity lookup failed (${res.status}).`,
    );
  }
  const rows = (await res.json()) as { identityProvider: string }[];
  return rows.map((row) => row.identityProvider);
};

/**
 * Ids of users whose roles changed since `since`. Needs realm-management
 * `view-events` and admin events enabled on the realm, or this throws.
 */
export const recentRoleEvents = async (
  since: number,
): Promise<{ userId: string; time: number }[]> => {
  const res = await adminFetch(
    "/admin-events?max=100&resourceTypes=REALM_ROLE_MAPPING" +
      "&resourceTypes=CLIENT_ROLE_MAPPING&resourceTypes=USER",
  );
  if (!res.ok) throw new Error(`Keycloak admin events failed (${res.status}).`);
  const events = (await res.json()) as {
    time?: number;
    resourcePath?: string;
  }[];

  return events.flatMap(({ time, resourcePath }) => {
    // authDetails.userId is the admin who acted; the target is in the path.
    const userId = /^users\/([^/]+)/.exec(resourcePath ?? "")?.[1];
    return userId && time && time > since ? [{ userId, time }] : [];
  });
};

export const usersWithRealmRole = async (
  roleName: string,
): Promise<{ id: string; username: string; enabled?: boolean }[]> => {
  const res = await adminFetch(
    `/roles/${encodeURIComponent(roleName)}/users?max=200`,
  );
  if (!res.ok) throw new Error(`Keycloak role holders failed (${res.status}).`);
  return (await res.json()) as {
    id: string;
    username: string;
    enabled?: boolean;
  }[];
};

const mapRealmRole = async (
  userId: string,
  roleName: string,
  method: "POST" | "DELETE",
  failure: string,
) => {
  const roleRes = await adminFetch(`/roles/${encodeURIComponent(roleName)}`);
  if (!roleRes.ok) {
    throw new Error(`Keycloak realm role "${roleName}" not found.`);
  }
  const role = (await roleRes.json()) as { id: string; name: string };
  const res = await adminFetch(userPath(userId, "/role-mappings/realm"), {
    method,
    body: JSON.stringify([{ id: role.id, name: role.name }]),
  });
  if (!res.ok) {
    throw new Error(`${failure} (${res.status}).`);
  }
};

export const removeRealmRole = (userId: string, roleName: string) =>
  mapRealmRole(userId, roleName, "DELETE", "Keycloak role removal failed");

export const setUserEnabled = async (userId: string, enabled: boolean) => {
  const res = await adminFetch(userPath(userId), {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(`Keycloak user update failed (${res.status}).`);
};

/** Only the fields passed are touched; everything else on the user is left alone. */
export const updateUser = async (
  userId: string,
  fields: { firstName?: string; lastName?: string; email?: string },
): Promise<void> => {
  const res = await adminFetch(userPath(userId), {
    method: "PUT",
    body: JSON.stringify(fields),
  });
  if (res.status === 409) {
    throw new Error("That email is already used by another account.");
  }
  if (!res.ok) {
    throw new Error(`Keycloak user update failed (${res.status}).`);
  }
};

/**
 * Sets a brand-new password outright, via Keycloak's dedicated reset endpoint
 * (not the generic user PUT, which cannot touch credentials). Always
 * non-temporary: this app has no hosted Keycloak login page to satisfy a
 * pending UPDATE_PASSWORD required action, so "must change password" is
 * enforced at the app level instead (see signup.passwordResetRequired).
 */
export const resetUserPassword = async (
  userId: string,
  password: string,
): Promise<void> => {
  const res = await adminFetch(userPath(userId, "/reset-password"), {
    method: "PUT",
    body: JSON.stringify({
      type: "password",
      value: password,
      temporary: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`Keycloak password reset failed (${res.status}).`);
  }
};

export const deleteUser = async (userId: string) => {
  const res = await adminFetch(userPath(userId), { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Keycloak user delete failed (${res.status}).`);
  }
};

export const assignRealmRole = (userId: string, roleName: string) =>
  mapRealmRole(userId, roleName, "POST", "Keycloak role assignment failed");
