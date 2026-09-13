import anyAscii from "any-ascii";
import type {
  IdentityMigrationRecord,
  RenamePreviewItem,
  SignupRecord,
} from "@/lib/api/types";
import {
  allocateUsername,
  credentialTypes,
  directRealmRoles,
  effectiveRealmRoles,
  federatedIdentities,
  getUser,
} from "@/lib/auth/keycloak-admin";
import { dottedAliasFor, fold, usernameFor } from "@/lib/auth/username";
import { findActiveMigrationForSignup } from "@/lib/db/identity-migrations";
import type { Entity } from "@/lib/db/repository";
import { ownsIdentities } from "@/lib/env";
import { listMailboxTree } from "@/lib/mail/migrate-mail";
import { domain, isProtectedMailbox } from "@/lib/mail/provision";
import {
  FORWARD_SCRIPT,
  accountAliases,
  accountIdOf,
  aliasTaken,
  isReadOnly,
  listAppPasswords,
  listSieveScripts,
  localPartTaken,
} from "@/lib/mail/stalwart";
import { reservedForSignup } from "./reserved";
import { FORWARD_DAYS, STEP_LIST } from "./step-list";

export type Refusal = { error: string; status: number };

export type RenamePlan = {
  record: IdentityMigrationRecord;
  preview: RenamePreviewItem[];
};

export const isRefusal = (value: unknown): value is Refusal =>
  typeof value === "object" && value !== null && "error" in value;

/** Same derivation as sign-up, so a name maps to one username everywhere. */
export const usernameBase = (firstName: string, lastName: string): string =>
  usernameFor(firstName, lastName) || fold(anyAscii(`${firstName}${lastName}`));

const refuse = (status: number, error: string): Refusal => ({ status, error });

const previewFor = (
  record: IdentityMigrationRecord,
  folders: number,
  messages: number,
): RenamePreviewItem[] => {
  const d = domain();
  const self = record.requestedBy.kind === "self";
  const they = self ? "You" : "They";
  const apps = record.from.appPasswords;
  const item = (
    id: string,
    title: string,
    detail: string,
  ): RenamePreviewItem => ({ id, title, detail, fixed: true });
  const plural = (n: number, word: string) =>
    `${n} ${word}${n === 1 ? "" : "s"}`;

  return [
    item(
      "username",
      `${self ? "Your" : "Their"} username becomes ${record.to.username}`,
      `${they} sign in as ${record.to.username}; the club address becomes ${record.to.username}@${d}.`,
    ),
    item(
      "alias",
      record.to.dottedAlias
        ? `${record.to.dottedAlias}@${d} is added as an alias`
        : "No dotted alias",
      record.to.dottedAlias
        ? "The friendlier form of the new address."
        : "The dotted form of the new name is already in use, so it is skipped.",
    ),
    item(
      "old-address",
      `${record.from.username}@${d} keeps delivering for ${FORWARD_DAYS} days`,
      `Senders get an automatic reply asking them to update their contacts, and each message is tagged. After ${FORWARD_DAYS} days the old address stops working and is never reissued.`,
    ),
    record.from.mailboxId
      ? item(
          "copy",
          `${plural(folders, "folder")} and ${plural(messages, "message")} are copied`,
          "Everything is copied and verified before the old mailbox is removed. Flags, dates and threads are kept; mail apps re-sync from scratch.",
        )
      : item(
          "copy",
          "No mailbox to move",
          "This account has no club mailbox, so only the login moves.",
        ),
    item(
      "app-passwords",
      apps.length
        ? `${plural(apps.length, "app password")} stop working`
        : "No app passwords to lose",
      apps.length
        ? `They cannot be moved: ${apps.map((one) => one.description).join(", ")}. Create new ones afterwards.`
        : "None are set up on this mailbox.",
    ),
    item(
      "clients",
      "Mail apps must be set up again",
      "Every device needs the new address. On Apple devices, remove the old Brock CSC Mail profile first; the new one does not replace it.",
    ),
    ...(record.sieve.length
      ? [
          item(
            "sieve",
            `${plural(record.sieve.length, "custom mail rule")} copied`,
            record.sieve.map((one) => one.name).join(", "),
          ),
        ]
      : []),
    item(
      "roles",
      `Roles carried over: ${record.roles.direct.join(", ") || "none"}`,
      "Granted on the new login before the old one is disabled; the effective set is checked to match.",
    ),
    item(
      "session",
      self
        ? `You'll be signed back in as ${record.to.username}`
        : `They sign in as ${record.to.username} with a temporary password`,
      self
        ? "If that fails you're signed out, and you sign in again with your usual password."
        : "Shown to you once and emailed to them; they must choose a new password at their next sign-in.",
    ),
    item(
      "notify",
      `Notices go to ${record.from.email || "their personal email"} and ${record.from.username}@${d}`,
      `One now, one at cut-over and one when everything is done — the later two to ${record.to.username}@${d}.`,
    ),
  ];
};

/** Read-only: checks every guard, allocates the target and captures the old side. */
export const planRename = async (
  signup: Entity<SignupRecord>,
  names: { firstName: string; lastName: string },
  requestedBy: { sub: string; kind: "self" | "approver" },
): Promise<RenamePlan | Refusal> => {
  const { username, keycloakUserId } = signup;
  if (!username || !keycloakUserId) {
    return refuse(422, "This account has no login or username to rename.");
  }
  if (isProtectedMailbox(username)) {
    return refuse(
      409,
      `${username}@${domain()} is a service account and cannot be renamed.`,
    );
  }
  if (signup.status !== "approved") {
    return refuse(409, "Only an approved account can be renamed.");
  }
  if (signup.passwordResetRequired && requestedBy.kind === "self") {
    return refuse(
      409,
      "Choose your own password first, then change your name.",
    );
  }
  if (await findActiveMigrationForSignup(signup.id)) {
    return refuse(
      409,
      "A username change is already in progress for this account.",
    );
  }

  const firstName = names.firstName.trim();
  const lastName = names.lastName.trim();
  const base = usernameBase(firstName, lastName);
  if (!base)
    return refuse(400, "We could not build a username from that name.");
  if (base === username) {
    return refuse(
      400,
      "That name keeps the same username; nothing to migrate.",
    );
  }

  const [credentials, federated, user] = await Promise.all([
    credentialTypes(keycloakUserId),
    federatedIdentities(keycloakUserId),
    getUser(keycloakUserId),
  ]);
  if (!user) {
    return refuse(422, "The Keycloak account behind this profile is gone.");
  }
  const immovable = [
    ...credentials.filter((type) => type !== "password"),
    ...federated.map((provider) => `${provider} login`),
  ];
  if (immovable.length) {
    return refuse(
      409,
      `This account has ${immovable.join(", ")} set up, which cannot be moved. Contact a co-president.`,
    );
  }

  const to = await allocateUsername(
    base,
    async (candidate) =>
      candidate === username || (await reservedForSignup(candidate)),
  );
  const mailboxId = await accountIdOf(username);
  const [aliases, readOnly, appPasswords, effectiveBefore, direct] =
    await Promise.all([
      mailboxId ? accountAliases(username) : [],
      mailboxId ? isReadOnly(username) : null,
      mailboxId ? listAppPasswords(username) : [],
      effectiveRealmRoles(keycloakUserId),
      directRealmRoles(keycloakUserId),
    ]);
  const dotted = dottedAliasFor(firstName, lastName);
  const dottedAlias =
    dotted && !(await aliasTaken(dotted)) && !(await localPartTaken(dotted))
      ? dotted
      : null;
  const tree = mailboxId ? await listMailboxTree(mailboxId) : [];
  const sieve = mailboxId
    ? (await listSieveScripts(mailboxId)).filter(
        (script) => script.name !== FORWARD_SCRIPT,
      )
    : [];

  const record: IdentityMigrationRecord = {
    signupId: signup.id,
    mode: ownsIdentities() ? "real" : "rehearsal",
    requestedBy,
    requestedAt: new Date().toISOString(),
    passwordSource: requestedBy.kind === "self" ? "confirmed" : "temp",
    from: {
      username,
      keycloakUserId,
      firstName: signup.firstName ?? "",
      lastName: signup.lastName ?? "",
      email: signup.email ?? "",
      phone: user.attributes?.phone?.[0] ?? signup.phone,
      mailboxId,
      aliases,
      readOnly: readOnly === true,
      appPasswords: appPasswords.map(({ description, createdAt }) => ({
        description,
        createdAt,
      })),
    },
    to: {
      username: to,
      firstName,
      lastName,
      email: signup.email ?? "",
      dottedAlias,
    },
    status: "planned",
    step: STEP_LIST[0].id,
    steps: Object.fromEntries(
      STEP_LIST.map((step) => [step.id, { status: "pending", attempts: 0 }]),
    ),
    mailboxes: {},
    copied: {},
    sieve: sieve.map(({ name, isActive }) => ({ name, isActive })),
    roles: { direct, effectiveBefore },
    lists: [],
    notified: {},
  };
  return {
    record,
    preview: previewFor(
      record,
      tree.length,
      tree.reduce((sum, box) => sum + box.totalEmails, 0),
    ),
  };
};
