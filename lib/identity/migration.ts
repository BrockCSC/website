/**
 * Username migration: copy the identity to a new Keycloak user and Stalwart
 * account, verify, then retire the old pair. Every step re-checks server
 * state before acting, so a crashed run resumes from its record; the lease
 * is the crash detector, and nothing destructive runs until verification has
 * passed after cut-over.
 */

import { randomUUID } from "node:crypto";
import type {
  ExecRecord,
  IdentityMigrationRecord,
  MailDeletionRequest,
  MigrationStepState,
  MigrationVerification,
  PasswordResetRecord,
  SignupRecord,
} from "@/lib/api/types";
import {
  allocateUsername,
  assignRealmRole,
  createDisabledUser,
  deleteUser,
  directRealmRoles,
  effectiveRealmRoles,
  findUserByUsername,
  setUserEnabled,
  updateUser,
} from "@/lib/auth/keycloak-admin";
import { invalidateRoles } from "@/lib/auth/session";
import { generateTempPassword } from "@/lib/auth/temp-password";
import { findMigration, retireUsername } from "@/lib/db/identity-migrations";
import {
  create,
  findAll,
  findById,
  remove,
  update,
  type Entity,
} from "@/lib/db/repository";
import {
  execsTable,
  identityMigrationsTable,
  passwordResetsTable,
  signupsTable,
} from "@/lib/db/schema";
import { adminAccess } from "@/lib/mail/access";
import { downloadBlob } from "@/lib/mail/jmap-mail";
import { deleteApprovedSender, isApprovedSender } from "@/lib/mail/oci-senders";
import {
  coPresidentsList,
  domain,
  makeMailboxReadOnly,
  provisionMailbox,
  syncMailRouting,
} from "@/lib/mail/provision";
import {
  FORWARD_SCRIPT,
  accountAliases,
  accountIdOf,
  aliasTaken,
  createMailbox,
  destroyAccount,
  listMailingLists,
  listSieveScripts,
  localPartTaken,
  makeReadOnly,
  putSieveScript,
  revokeAppPasswords,
  setAccountAliases,
  updateMailingList,
} from "@/lib/mail/stalwart";
import { sameSet, type MigrationCtx } from "./context";
import { ensureFolders, syncMail, verifyMail } from "./mail-sync";
import {
  notifyRenameCutover,
  notifyRenameDone,
  notifyRenameFailed,
  notifyRenameRequested,
} from "./notices";
import { forgetPassword, peekPassword, stashPassword } from "./password-vault";
import { usernameBase, type RenamePlan } from "./plan";
import { requirePreflight } from "./preflight";
import { reservedForSignup } from "./reserved";
import { RETIRED_NOTICE_SCRIPT, retiredNoticeScript } from "./retired-notice";
import { FIRST_CUTOVER_STEP, FORWARD_DAYS, STEP_LIST } from "./step-list";
import { leaseExpired } from "./view";

const LEASE_MS = 60_000;
/** After cut-over, how long to wait for the browser's hand-off before deleting the old login anyway. */
const HANDOFF_GRACE_MS = 15 * 60_000;
const TEMP_PASSWORD_TTL_MS = 60 * 60_000;
const MIGRATION_REDIRECT_SCRIPT = "migration-redirect";

const RUNNER = randomUUID();
const running = new Set<string>();

type Step = {
  id: string;
  destructive?: boolean;
  skipWhen?: (ctx: MigrationCtx) => boolean;
  /** Milliseconds until the step may run; the loop lets go and comes back. */
  waitFor?: (ctx: MigrationCtx) => number;
  run: (ctx: MigrationCtx) => Promise<void>;
};

const now = () => new Date().toISOString();
const address = (localPart: string) => `${localPart}@${domain()}`;
const noMailbox = (ctx: MigrationCtx) => ctx.record.from.mailboxId === null;
const normalise = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

const remapDeletion =
  (copied: Record<string, string>) =>
  (request: MailDeletionRequest): MailDeletionRequest => {
    if (request.status === "done" || request.status === "declined") {
      return request;
    }
    const messageIds = request.messageIds.flatMap((id) =>
      copied[id] ? [copied[id]] : [],
    );
    if (messageIds.length === request.messageIds.length) {
      return { ...request, messageIds };
    }
    return {
      ...request,
      messageIds,
      status: "declined",
      reviewedBy: "system: mailbox migrated",
      reviewedAt: now(),
    };
  };

const installRetiredNotice = async (record: IdentityMigrationRecord) => {
  const include = record.sieve.find((script) => script.isActive)?.name ?? null;
  // A read-only successor forwards to the co-presidents instead; that script
  // has to stay the active one, so the notice is installed but not activated.
  await putSieveScript(
    record.to.mailboxId!,
    RETIRED_NOTICE_SCRIPT,
    retiredNoticeScript({
      retired: [record.from.username, ...record.from.aliases].map(address),
      successor: address(record.to.username),
      forwardUntil: record.forwardUntil!,
      include,
    }),
    !record.from.readOnly,
  );
};

const STEPS: Step[] = [
  {
    id: "keycloak:create",
    run: async (ctx) => {
      const { record } = ctx;
      if (record.to.keycloakUserId) return;
      const existing = await findUserByUsername(record.to.username);
      if (existing) {
        if (existing.enabled) {
          throw new Error(
            `Keycloak already has an enabled user "${record.to.username}".`,
          );
        }
        await ctx.save({ to: { ...record.to, keycloakUserId: existing.id } });
        return;
      }
      let password = peekPassword(record.id);
      let passwordSource = record.passwordSource;
      if (!password) {
        // The confirmed password did not survive a restart; they get a
        // temporary one to change at next sign-in instead.
        password = generateTempPassword();
        passwordSource = "temp";
        stashPassword(record.id, password, TEMP_PASSWORD_TTL_MS);
      }
      const make = (username: string) =>
        createDisabledUser({
          username,
          // Keycloak refuses two users with one email; the old user gives
          // the address up at freeze-old and the new one takes it at enable-new.
          firstName: record.to.firstName,
          lastName: record.to.lastName,
          password: password!,
          attributes: record.from.phone
            ? { phone: [record.from.phone] }
            : undefined,
        });
      let username = record.to.username;
      let keycloakUserId: string;
      try {
        keycloakUserId = await make(username);
      } catch (err) {
        if (!(err instanceof Error && err.message.includes("already taken"))) {
          throw err;
        }
        username = await allocateUsername(
          usernameBase(record.to.firstName, record.to.lastName),
          async (candidate) =>
            candidate === record.from.username ||
            (await reservedForSignup(candidate)),
        );
        keycloakUserId = await make(username);
      }
      await ctx.save({
        to: { ...record.to, username, keycloakUserId },
        passwordSource,
      });
    },
  },
  {
    id: "keycloak:roles",
    run: async (ctx) => {
      const id = ctx.record.to.keycloakUserId!;
      for (const role of ctx.record.roles.direct) {
        await assignRealmRole(id, role);
      }
      const effective = await effectiveRealmRoles(id);
      const before = ctx.record.roles.effectiveBefore;
      if (!sameSet(effective, before)) {
        throw new Error(
          `Effective roles differ: expected ${before.join(", ")}; got ${effective.join(", ")}.`,
        );
      }
    },
  },
  {
    id: "mailbox:create",
    skipWhen: noMailbox,
    run: async (ctx) => {
      const { to } = ctx.record;
      if (!(await localPartTaken(to.username))) {
        const alias =
          to.dottedAlias && !(await aliasTaken(to.dottedAlias))
            ? to.dottedAlias
            : undefined;
        await createMailbox({
          localPart: to.username,
          displayName: [to.firstName, to.lastName].filter(Boolean).join(" "),
          alias,
          domain: domain(),
        });
        if (!alias && to.dottedAlias) {
          await ctx.save({ to: { ...to, dottedAlias: null } });
        }
      }
      const mailboxId = await accountIdOf(to.username);
      if (!mailboxId) {
        throw new Error(
          `Stalwart has no account "${to.username}" after creating it.`,
        );
      }
      await ctx.save({ to: { ...ctx.record.to, mailboxId } });
    },
  },
  { id: "mailbox:folders", skipWhen: noMailbox, run: ensureFolders },
  {
    id: "mailbox:copy",
    skipWhen: noMailbox,
    run: (ctx) => syncMail(ctx, false),
  },
  {
    id: "mailbox:sieve",
    skipWhen: noMailbox,
    run: async (ctx) => {
      const from = ctx.record.from.mailboxId!;
      const to = ctx.record.to.mailboxId!;
      const managed = [
        FORWARD_SCRIPT,
        MIGRATION_REDIRECT_SCRIPT,
        RETIRED_NOTICE_SCRIPT,
      ];
      const sieve: IdentityMigrationRecord["sieve"] = [];
      for (const script of await listSieveScripts(from)) {
        if (managed.includes(script.name) || !script.blobId) continue;
        const text = await (
          await downloadBlob(
            adminAccess(from),
            script.blobId,
            script.name,
            "application/sieve",
          )
        ).text();
        const newId = await putSieveScript(
          to,
          script.name,
          text,
          script.isActive,
        );
        sieve.push({ name: script.name, isActive: script.isActive, newId });
      }
      await ctx.save({ sieve });
    },
  },
  {
    id: "verify:pre",
    skipWhen: noMailbox,
    run: async (ctx) => {
      // Informational: the old mailbox is still live, so drift is expected.
      const mail = await verifyMail(ctx);
      await ctx.save({
        verification: {
          ...mail,
          at: now(),
          sieveOk: true,
          rolesOk: true,
          aliasesOk: true,
          senderOk: true,
        },
      });
    },
  },
  {
    id: "keycloak:freeze-old",
    run: async (ctx) => {
      const { from } = ctx.record;
      await setUserEnabled(from.keycloakUserId, false);
      if (from.email) {
        await updateUser(from.keycloakUserId, {
          email: `retired-${from.username}@${domain()}`,
        });
      }
    },
  },
  {
    id: "mailbox:freeze-old",
    skipWhen: noMailbox,
    run: async (ctx) => {
      const { from, to } = ctx.record;
      await makeReadOnly(from.username);
      // No :copy, unlike the alumni forward: from here the old box stops
      // filling, so the delta after it is final.
      await putSieveScript(
        from.mailboxId!,
        MIGRATION_REDIRECT_SCRIPT,
        `redirect "${address(to.username)}";\n`,
        true,
      );
    },
  },
  {
    id: "mailbox:delta",
    skipWhen: noMailbox,
    run: async (ctx) => {
      await ensureFolders(ctx);
      await syncMail(ctx, true);
    },
  },
  {
    id: "db:repoint",
    run: async (ctx) => {
      const { record } = ctx;
      const signup = await findById<SignupRecord>(
        signupsTable,
        record.signupId,
      );
      if (!signup) throw new Error("The sign-up record is gone.");
      const forwardUntil =
        record.forwardUntil ??
        new Date(Date.now() + FORWARD_DAYS * 86_400_000).toISOString();
      if (signup.username !== record.to.username) {
        await update<SignupRecord>(signupsTable, signup.id, {
          username: record.to.username,
          keycloakUserId: record.to.keycloakUserId,
          firstName: record.to.firstName,
          lastName: record.to.lastName,
          previousUsernames: [
            ...(signup.previousUsernames ?? []),
            record.from.username,
          ],
          identityMigrationId: record.id,
          mailDeletionRequests: (signup.mailDeletionRequests ?? []).map(
            remapDeletion(record.copied),
          ),
          passwordResetRequired: record.passwordSource === "temp",
        });
      }
      for (const row of await findAll<PasswordResetRecord>(
        passwordResetsTable,
      )) {
        if (row.signupId === signup.id)
          await remove(passwordResetsTable, row.id);
      }
      await retireUsername({
        localPart: record.from.username,
        aliases: record.from.aliases.filter(
          (alias) => alias !== record.from.username,
        ),
        signupId: signup.id,
        successor: record.to.username,
        migrationId: record.id,
        retiredAt: now(),
        forwardUntil,
      });
      invalidateRoles(record.from.keycloakUserId);
      await ctx.save({ forwardUntil });
    },
  },
  {
    id: "keycloak:enable-new",
    run: async (ctx) => {
      const { from, to } = ctx.record;
      if (from.email)
        await updateUser(to.keycloakUserId!, { email: from.email });
      await setUserEnabled(to.keycloakUserId!, true);
      invalidateRoles(to.keycloakUserId!);
    },
  },
  {
    id: "mail:routing",
    skipWhen: noMailbox,
    run: async (ctx) => {
      const { from, to } = ctx.record;
      if (from.readOnly) await makeMailboxReadOnly(to.username);
      else {
        await provisionMailbox({
          username: to.username,
          firstName: to.firstName,
          lastName: to.lastName,
        });
      }
      await syncMailRouting();
      const old = address(from.username);
      const lists: IdentityMigrationRecord["lists"] = [];
      for (const list of await listMailingLists()) {
        if (
          list.name === coPresidentsList() ||
          !list.recipients.includes(old)
        ) {
          continue;
        }
        await updateMailingList(
          list.id,
          {
            recipients: [
              ...new Set(
                list.recipients.map((one) =>
                  one === old ? address(to.username) : one,
                ),
              ),
            ],
          },
          domain(),
        );
        lists.push({ id: list.id, name: list.name, updated: true });
      }
      await ctx.save({ lists });
    },
  },
  {
    id: "session:handoff",
    run: async (ctx) => {
      const { record } = ctx;
      await ctx.save({
        status: "cut-over",
        cutOverAt: record.cutOverAt ?? now(),
        // A temporary password means a fresh sign-in either way.
        ...(record.passwordSource === "temp" && !record.handoff
          ? { handoff: { at: now(), how: "relogin" as const } }
          : {}),
      });
    },
  },
  {
    id: "notify:cutover",
    run: async (ctx) => {
      const { record } = ctx;
      if (record.notified.cutover) return;
      await notifyRenameCutover(
        record,
        record.passwordSource === "temp" ? peekPassword(record.id) : null,
      );
      await ctx.save({ notified: { ...record.notified, cutover: now() } });
    },
  },
  {
    id: "verify:final",
    run: async (ctx) => {
      const { record } = ctx;
      const notes: string[] = [];
      let mail = {
        folders: {},
        messagesChecked: 0,
        keywordMismatches: 0,
        receivedAtMismatches: 0,
        otherMismatches: 0,
        notes: [] as string[],
        ok: true,
      };
      let sieveOk = true;
      let aliasesOk = true;
      let senderOk = true;
      if (!noMailbox(ctx)) {
        await ensureFolders(ctx);
        await syncMail(ctx, true);
        mail = await verifyMail(ctx);
        const have = await listSieveScripts(record.to.mailboxId!);
        for (const script of record.sieve) {
          if (!have.some((one) => one.name === script.name)) {
            sieveOk = false;
            notes.push(
              `Mail rule "${script.name}" is missing on the new mailbox.`,
            );
          }
        }
        if (record.to.dottedAlias) {
          aliasesOk = (await accountAliases(record.to.username)).includes(
            record.to.dottedAlias,
          );
          if (!aliasesOk)
            notes.push(`Alias ${record.to.dottedAlias} is missing.`);
        }
        if (!record.from.readOnly) {
          senderOk = await isApprovedSender(address(record.to.username)).catch(
            () => false,
          );
          if (!senderOk) {
            notes.push(
              `${address(record.to.username)} is not an approved sender in OCI.`,
            );
          }
        }
      }
      const id = record.to.keycloakUserId!;
      const [effective, direct] = await Promise.all([
        effectiveRealmRoles(id),
        directRealmRoles(id),
      ]);
      const rolesOk =
        sameSet(effective, record.roles.effectiveBefore) &&
        sameSet(direct, record.roles.direct);
      if (!rolesOk) {
        notes.push(
          `Roles on ${record.to.username} differ: effective ${effective.join(", ")}; direct ${direct.join(", ")}.`,
        );
      }
      const verification: MigrationVerification = {
        ...mail,
        at: now(),
        ok: mail.ok && sieveOk && rolesOk && aliasesOk && senderOk,
        sieveOk,
        rolesOk,
        aliasesOk,
        senderOk,
        notes: [...mail.notes, ...notes],
      };
      await ctx.save({ verification });
      if (!verification.ok) {
        throw new Error(`Verification failed: ${verification.notes.join(" ")}`);
      }
    },
  },
  {
    id: "retire:old-mailbox",
    destructive: true,
    skipWhen: noMailbox,
    run: async (ctx) => {
      const { from, to } = ctx.record;
      if (await localPartTaken(from.username)) {
        await revokeAppPasswords(from.username);
        await deleteApprovedSender(address(from.username)).catch((err) => {
          console.warn(
            `could not drop the OCI sender for ${from.username}: ${err instanceof Error ? err.message : err}`,
          );
        });
        await destroyAccount(from.username);
      }
      // Stalwart will not hand an address to a second principal, which is
      // why the old account goes first and the aliases follow.
      const current = await accountAliases(to.username);
      const wanted = [
        ...new Set([...current, from.username, ...from.aliases]),
      ].filter((alias) => alias !== to.username);
      if (!sameSet(current, wanted)) {
        await setAccountAliases(to.username, wanted, domain());
      }
      await installRetiredNotice(ctx.record);
    },
  },
  {
    id: "retire:old-keycloak",
    destructive: true,
    waitFor: (ctx) =>
      ctx.record.handoff
        ? 0
        : Math.max(
            0,
            new Date(ctx.record.cutOverAt!).getTime() +
              HANDOFF_GRACE_MS -
              Date.now(),
          ),
    run: async (ctx) => {
      await deleteUser(ctx.record.from.keycloakUserId);
      invalidateRoles(ctx.record.from.keycloakUserId);
    },
  },
  {
    id: "exec:name",
    run: async (ctx) => {
      const { from, to, signupId } = ctx.record;
      const signup = await findById<SignupRecord>(signupsTable, signupId);
      if (!signup?.execKey) return;
      const exec = await findById<ExecRecord>(execsTable, signup.execKey);
      const was = normalise(`${from.firstName} ${from.lastName}`);
      if (!exec || !was || normalise(exec.name ?? "") !== was) return;
      await update<ExecRecord>(execsTable, exec.id, {
        name: [to.firstName, to.lastName].filter(Boolean).join(" "),
      });
    },
  },
  {
    id: "notify:done",
    run: async (ctx) => {
      const { record } = ctx;
      if (!record.notified.done) await notifyRenameDone(record);
      forgetPassword(record.id);
      await ctx.save({
        status: "done",
        notified: { ...record.notified, done: record.notified.done ?? now() },
      });
    },
  },
];

const mayDestroy = (record: IdentityMigrationRecord) =>
  record.status === "cut-over" &&
  record.verification?.ok === true &&
  record.steps["verify:final"]?.status === "done";

const release = async (id: string) => {
  const record = await findMigration(id);
  if (record?.lease?.by === RUNNER) {
    await update<IdentityMigrationRecord>(identityMigrationsTable, id, {
      lease: null,
    });
  }
};

/** Null when another runner holds a live lease. */
const takeLease = async (
  id: string,
): Promise<Entity<IdentityMigrationRecord> | null> => {
  const record = await findMigration(id);
  if (!record) return null;
  if (record.lease && !leaseExpired(record) && record.lease.by !== RUNNER) {
    return null;
  }
  await update<IdentityMigrationRecord>(identityMigrationsTable, id, {
    lease: { until: new Date(Date.now() + LEASE_MS).toISOString(), by: RUNNER },
  });
  const taken = await findMigration(id);
  return taken?.lease?.by === RUNNER ? taken : null;
};

const mark = (ctx: MigrationCtx, stepId: string, state: MigrationStepState) =>
  ctx.save({ steps: { ...ctx.record.steps, [stepId]: state } });

export const runSteps = async (id: string): Promise<void> => {
  if (running.has(id)) return;
  running.add(id);
  try {
    const leased = await takeLease(id);
    if (!leased) return;
    const ctx: MigrationCtx = {
      record: leased,
      save: async (patch) => {
        const next = await update<IdentityMigrationRecord>(
          identityMigrationsTable,
          id,
          {
            ...patch,
            lease: {
              until: new Date(Date.now() + LEASE_MS).toISOString(),
              by: RUNNER,
            },
          },
        );
        if (!next) throw new Error(`Migration ${id} vanished mid-run.`);
        ctx.record = next;
      },
    };
    if (!["planned", "running", "cut-over"].includes(ctx.record.status)) return;
    if (ctx.record.status === "planned") await ctx.save({ status: "running" });

    for (const meta of STEP_LIST) {
      const step = STEPS.find((one) => one.id === meta.id)!;
      const state = ctx.record.steps[step.id] ?? {
        status: "pending",
        attempts: 0,
      };
      if (state.status !== "pending") continue;
      if (step.skipWhen?.(ctx)) {
        await mark(ctx, step.id, { ...state, status: "skipped", at: now() });
        continue;
      }
      const wait = step.waitFor?.(ctx) ?? 0;
      if (wait > 0) {
        await release(id);
        running.delete(id);
        setTimeout(() => void runSteps(id), Math.min(wait, LEASE_MS));
        return;
      }
      await ctx.save({ step: step.id });
      try {
        if (step.destructive && !mayDestroy(ctx.record)) {
          throw new Error(
            "Refused: verification has not passed since cut-over.",
          );
        }
        await step.run(ctx);
        await mark(ctx, step.id, {
          status: "done",
          at: now(),
          attempts: state.attempts + 1,
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        await mark(ctx, step.id, {
          status: "failed",
          at: now(),
          attempts: state.attempts + 1,
          error,
        });
        await ctx.save({ status: "failed", error });
        await notifyRenameFailed(ctx.record, step.id, error)
          .then(() =>
            ctx.save({ notified: { ...ctx.record.notified, failed: now() } }),
          )
          .catch((mailErr) => {
            console.error(
              `migration ${id} failure notice failed: ${mailErr instanceof Error ? mailErr.message : mailErr}`,
            );
          });
        return;
      }
    }
  } catch (err) {
    console.error(
      `migration ${id} runner stopped: ${err instanceof Error ? err.message : err}`,
    );
  } finally {
    await release(id).catch(() => {});
    running.delete(id);
  }
};

/**
 * Persists the plan and kicks the runner off in the background. Outside
 * production the record is written with every step rehearsed and nothing
 * else happens.
 */
export const startMigration = async (
  plan: RenamePlan,
  password: string,
): Promise<Entity<IdentityMigrationRecord>> => {
  if (plan.record.mode === "rehearsal") {
    return create<IdentityMigrationRecord>(identityMigrationsTable, {
      ...plan.record,
      status: "done",
      steps: Object.fromEntries(
        STEP_LIST.map((step) => [
          step.id,
          { status: "rehearsed", attempts: 0, at: now() },
        ]),
      ),
    });
  }
  requirePreflight();
  const record = await create<IdentityMigrationRecord>(
    identityMigrationsTable,
    plan.record,
  );
  stashPassword(
    record.id,
    password,
    plan.record.passwordSource === "temp" ? TEMP_PASSWORD_TTL_MS : undefined,
  );
  await notifyRenameRequested(record)
    .then(() =>
      update<IdentityMigrationRecord>(identityMigrationsTable, record.id, {
        notified: { requested: now() },
      }),
    )
    .catch((err) => {
      console.error(
        `migration ${record.id} request notice failed: ${err instanceof Error ? err.message : err}`,
      );
    });
  void runSteps(record.id);
  return record;
};

const busy = (record: IdentityMigrationRecord, id: string) =>
  running.has(id) || (!!record.lease && !leaseExpired(record));

export const resumeMigration = async (
  id: string,
): Promise<{ error?: string }> => {
  const record = await findMigration(id);
  if (!record) return { error: "No such migration." };
  if (record.mode === "rehearsal") return { error: "Rehearsals do not run." };
  if (["done", "aborted"].includes(record.status)) {
    return { error: "That change has already finished." };
  }
  if (busy(record, id)) return { error: "It is running right now." };
  if (record.status === "failed") {
    const steps = Object.fromEntries(
      Object.entries(record.steps).map(([stepId, state]) => [
        stepId,
        state.status === "failed"
          ? { status: "pending" as const, attempts: state.attempts }
          : state,
      ]),
    );
    await update<IdentityMigrationRecord>(identityMigrationsTable, id, {
      steps,
      status: record.cutOverAt ? "cut-over" : "running",
      error: null,
    });
  }
  void runSteps(id);
  return {};
};

/** Only before cut-over: after that the record may already point at the new identity. */
export const abortMigration = async (
  id: string,
): Promise<{ error?: string }> => {
  const record = await findMigration(id);
  if (!record) return { error: "No such migration." };
  if (["done", "aborted"].includes(record.status)) {
    return { error: "That change has already finished." };
  }
  if (record.steps[FIRST_CUTOVER_STEP]?.status !== "pending") {
    return {
      error:
        "The cut-over has started, so this can only be resumed, not aborted.",
    };
  }
  if (busy(record, id)) return { error: "It is running right now." };
  if (record.mode === "real") {
    if (record.to.keycloakUserId) await deleteUser(record.to.keycloakUserId);
    if (record.to.mailboxId) await destroyAccount(record.to.username);
  }
  forgetPassword(id);
  await update<IdentityMigrationRecord>(identityMigrationsTable, id, {
    status: "aborted",
    lease: null,
    error: null,
  });
  return {};
};

/** Marks the member's own session as replaced, so the old login may go. */
export const recordHandoff = async (
  id: string,
  how: "session" | "relogin",
): Promise<void> => {
  await update<IdentityMigrationRecord>(identityMigrationsTable, id, {
    handoff: { at: now(), how },
  });
  forgetPassword(id);
  void runSteps(id);
};

/** The browser's polling doubles as the crash detector for its own migration. */
export const resumeIfStale = (record: Entity<IdentityMigrationRecord>) => {
  if (
    record.mode === "real" &&
    ["running", "cut-over"].includes(record.status) &&
    leaseExpired(record)
  ) {
    void runSteps(record.id);
  }
};
