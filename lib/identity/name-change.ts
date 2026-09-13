import type { ExecRecord, SignupRecord } from "@/lib/api/types";
import { updateUser } from "@/lib/auth/keycloak-admin";
import { dottedAliasFor } from "@/lib/auth/username";
import { findById, update, type Entity } from "@/lib/db/repository";
import { execsTable } from "@/lib/db/schema";
import { domain } from "@/lib/mail/provision";
import {
  accountAliases,
  aliasTaken,
  localPartTaken,
  setAccountAliases,
  setDescription,
} from "@/lib/mail/stalwart";
import { sameSet } from "./context";

type Names = { firstName: string; lastName: string };

const normalise = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

const fullName = ({ firstName, lastName }: Names) =>
  [firstName, lastName].filter(Boolean).join(" ");

/**
 * A name change that keeps the username: Keycloak, the mailbox's display
 * name and its dotted alias follow. Production only; the caller checks.
 */
export const syncNameChange = async (
  signup: Entity<SignupRecord>,
  names: Names,
): Promise<void> => {
  if (signup.keycloakUserId) {
    await updateUser(signup.keycloakUserId, names);
  }
  if (!signup.username || !(await localPartTaken(signup.username))) return;
  await setDescription(signup.username, fullName(names));

  const before = dottedAliasFor(signup.firstName ?? "", signup.lastName ?? "");
  const after = dottedAliasFor(names.firstName, names.lastName);
  if (before === after) return;
  const current = await accountAliases(signup.username);
  const next = current.filter((alias) => alias !== before);
  if (
    after &&
    !next.includes(after) &&
    !(await aliasTaken(after)) &&
    !(await localPartTaken(after))
  ) {
    next.push(after);
  }
  if (!sameSet(current, next)) {
    await setAccountAliases(signup.username, next, domain());
  }
};

/**
 * The tile name is the approver's, so it only follows when it still reads
 * exactly as the old sign-up name — a curated title stays put.
 */
export const syncExecName = async (
  signup: Entity<SignupRecord>,
  names: Names,
): Promise<void> => {
  if (!signup.execKey) return;
  const exec = await findById<ExecRecord>(execsTable, signup.execKey);
  if (!exec) return;
  const was = normalise(
    fullName({
      firstName: signup.firstName ?? "",
      lastName: signup.lastName ?? "",
    }),
  );
  if (!was || normalise(exec.name ?? "") !== was) return;
  await update<ExecRecord>(execsTable, exec.id, { name: fullName(names) });
};
