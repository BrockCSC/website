import type { SignupRecord } from "@/lib/api/types";
import { findAll } from "./repository";
import { signupsTable } from "./schema";

/** Keycloak `sub` is the stable identity; usernames can be changed in Keycloak. */
export const findSignupByUserId = async (keycloakUserId: string) =>
  (await findAll<SignupRecord>(signupsTable)).find(
    (signup) => signup.keycloakUserId === keycloakUserId,
  ) ?? null;

export const findSignupByExecKey = async (execKey: string) =>
  (await findAll<SignupRecord>(signupsTable)).find(
    (signup) => signup.execKey === execKey,
  ) ?? null;
