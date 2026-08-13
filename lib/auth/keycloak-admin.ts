/**
 * Keycloak Admin REST API client.
 *
 * Uses a client_credentials service account, which must hold the
 * realm-management `manage-users` and `view-realm` roles. Configure via
 * KEYCLOAK_ADMIN_CLIENT_ID / KEYCLOAK_ADMIN_CLIENT_SECRET; falls back to the
 * login client when they are not set separately.
 */

export type NewKeycloakUser = {
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
  const res = await fetch(`${issuer}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
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

/** Effective realm roles, including those inherited from groups and composites. */
export const effectiveRealmRoles = async (
  userId: string,
): Promise<string[]> => {
  const res = await adminFetch(
    userPath(userId, "/role-mappings/realm/composite"),
  );
  if (!res.ok) throw new Error(`Keycloak role lookup failed (${res.status}).`);
  const roles = (await res.json()) as { name: string }[];
  return roles.map((role) => role.name);
};

export const usersWithRealmRole = async (
  roleName: string,
): Promise<{ id: string; username: string }[]> => {
  const res = await adminFetch(
    `/roles/${encodeURIComponent(roleName)}/users?max=200`,
  );
  if (!res.ok) throw new Error(`Keycloak role holders failed (${res.status}).`);
  return (await res.json()) as { id: string; username: string }[];
};

export const removeRealmRole = async (userId: string, roleName: string) => {
  const roleRes = await adminFetch(`/roles/${encodeURIComponent(roleName)}`);
  if (!roleRes.ok) {
    throw new Error(`Keycloak realm role "${roleName}" not found.`);
  }
  const role = (await roleRes.json()) as { id: string; name: string };
  const res = await adminFetch(userPath(userId, "/role-mappings/realm"), {
    method: "DELETE",
    body: JSON.stringify([{ id: role.id, name: role.name }]),
  });
  if (!res.ok) {
    throw new Error(`Keycloak role removal failed (${res.status}).`);
  }
};

export const setUserEnabled = async (userId: string, enabled: boolean) => {
  const res = await adminFetch(userPath(userId), {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(`Keycloak user update failed (${res.status}).`);
};

export const deleteUser = async (userId: string) => {
  const res = await adminFetch(userPath(userId), { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Keycloak user delete failed (${res.status}).`);
  }
};

export const assignRealmRole = async (userId: string, roleName: string) => {
  const roleRes = await adminFetch(`/roles/${encodeURIComponent(roleName)}`);
  if (!roleRes.ok) {
    throw new Error(`Keycloak realm role "${roleName}" not found.`);
  }
  const role = (await roleRes.json()) as { id: string; name: string };

  const res = await adminFetch(userPath(userId, "/role-mappings/realm"), {
    method: "POST",
    body: JSON.stringify([{ id: role.id, name: role.name }]),
  });
  if (!res.ok) {
    throw new Error(`Keycloak role assignment failed (${res.status}).`);
  }
};

export { usernameFor } from "./username";
