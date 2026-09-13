"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { withAs } from "../mail/inbox-picker";
import {
  abortPersonMigration,
  applyToPerson,
  deleteAccount,
  deleteTile,
  fetchPerson,
  previewPersonRename,
  resetPersonPassword,
  resumeMigration,
  startPersonRename,
  type ApplyResult,
  type PasswordResetResult,
  type Person,
  type PersonDetail,
  type RenameNames,
} from "./api";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import type { RenamePreview } from "@/lib/api/types";
import { useSession } from "../session";
import Confirm, { type ConfirmItem } from "./confirm";
import DetailsForm from "./details-form";
import MigrationSteps, { statusLabel } from "./migration-steps";
import ProfileForm from "./profile-form";
import { Note, Panel, Pill, Rows } from "./ui";
import { ask } from "../ask";
import { capabilitiesOf, impliedBy } from "@/lib/auth/capabilities";

const date = (value?: string) =>
  value ? new Date(value).toLocaleDateString() : "—";

const MIGRATION_POLL_MS = 5_000;

const isLive = (migration: PersonDetail["migrations"][number]) =>
  migration.mode === "real" &&
  ["planned", "running", "cut-over"].includes(migration.status);

const summary = (result: ApplyResult) =>
  [
    result.applied.length ? `${result.applied.length} applied` : "",
    result.rehearsed.length
      ? `${result.rehearsed.length} rehearsed, not written`
      : "",
    result.skipped.length ? `${result.skipped.length} skipped` : "",
    result.failed.length
      ? `failed: ${result.failed.map((f) => f.error).join("; ")}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");

export default function PersonView({
  person,
  onBack,
  onChanged,
}: {
  person: Person;
  onBack: () => void;
  onChanged: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const signup = detail?.signup;
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [open, setOpen] = useState<"transition" | "delete" | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<
    (PasswordResetResult & { rename?: boolean }) | null
  >(null);
  const [copied, setCopied] = useState<boolean | null>(null);
  const [renamePreview, setRenamePreview] = useState<
    (RenamePreview & { names: RenameNames }) | null
  >(null);
  const [migrationBusy, setMigrationBusy] = useState<string | null>(null);
  const { user } = useSession();

  const load = useCallback(async () => {
    try {
      setDetail(await fetchPerson(person.id));
      setError(null);
    } catch {
      setError("Could not read this person right now.");
    }
  }, [person.id]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const migrating = detail?.migrations.some(isLive) ?? false;
  useEffect(() => {
    if (!migrating) return;
    const timer = setInterval(() => void load(), MIGRATION_POLL_MS);
    return () => clearInterval(timer);
  }, [migrating, load]);

  const requestRename = async (names: RenameNames) => {
    if (!signup) return;
    setError(null);
    try {
      const preview = await previewPersonRename(signup.$key, names);
      setRenamePreview({ ...preview, names });
      setEditingDetails(false);
    } catch (err) {
      setError(
        (err instanceof ApiError && err.detail) ||
          "Could not work out what renaming them would involve.",
      );
    }
  };

  const confirmRename = async () => {
    if (!signup || !renamePreview) return;
    setError(null);
    try {
      const started = await startPersonRename(signup.$key, renamePreview.names);
      setRenamePreview(null);
      setResetResult({
        tempPassword: started.tempPassword,
        rehearsed: started.rehearsed,
        rename: true,
      });
      setCopied(null);
      await load();
      await onChanged();
    } catch (err) {
      setRenamePreview(null);
      setError(
        (err instanceof ApiError && err.detail) ||
          "Could not start the rename.",
      );
    }
  };

  const driveMigration = async (id: string, action: "resume" | "abort") => {
    if (action === "abort") {
      const ok = await ask({
        title: "Abort this username change?",
        detail:
          "Nothing has been taken away yet, so this removes the new login and mailbox that were being prepared.",
        confirmLabel: "Abort",
        destructive: true,
      });
      if (ok === null) return;
    }
    setMigrationBusy(`${id}:${action}`);
    setError(null);
    try {
      await (action === "resume"
        ? resumeMigration(id)
        : abortPersonMigration(id));
      await load();
      await onChanged();
    } catch (err) {
      setError(
        (err instanceof ApiError && err.detail) ||
          `Could not ${action} that change.`,
      );
    } finally {
      setMigrationBusy(null);
    }
  };

  const confirmRole = async (
    item: { id: string; title: string },
    role: string,
    held: boolean,
  ) => {
    const gains = capabilitiesOf(role);
    const also = impliedBy(role);
    const lines = gains.map((c) => `${c.label} — ${c.detail}`).join("\n");
    const ok = await ask({
      title: item.title,
      detail:
        (held
          ? `${person.name} loses:\n${lines}`
          : `${person.name} gains:\n${lines}`) +
        (also.length
          ? `\n\nThis role carries ${also.join(" and ")} with it.`
          : ""),
      confirmLabel: held ? "Revoke" : "Grant",
      destructive: held,
    });
    if (ok === null) return;
    await apply([item.id]);
  };

  const apply = async (ids: string[]) => {
    setResult(null);
    setWorking(ids.join(" "));
    try {
      const applied = await applyToPerson(person.id, ids);
      setResult(applied);
      setOpen(null);
      await load();
      await onChanged();
    } catch {
      setError("That change could not be made.");
    } finally {
      setWorking(null);
    }
  };

  const remove = async (ids: string[]) => {
    try {
      if (detail?.signup) {
        await deleteAccount(detail.signup.$key, ids.includes("tile"));
      } else if (detail?.exec) {
        await deleteTile(detail.exec.$key);
      }
      await onChanged();
      onBack();
    } catch {
      setError("Could not delete this person.");
    }
  };

  const isSelf =
    !!signup?.keycloakUserId && signup.keycloakUserId === user?.sub;

  const resetPassword = async () => {
    if (!signup) return;
    const recipients = [signup.email, detail?.mailbox.address]
      .filter(Boolean)
      .join(" and ");
    const ok = await ask({
      title: `Reset ${person.name}'s password?`,
      detail:
        `Their current password stops working immediately, and every app password is revoked, so any mail apps they connected are signed out too. ` +
        `You'll see a temporary password to give them` +
        (recipients ? `, and it's emailed to ${recipients}` : "") +
        `. They have to choose a new password at the portal sign-in, then make a new app password on the mail setup page for each mail app.`,
      confirmLabel: "Reset password",
      destructive: true,
    });
    if (ok === null) return;
    setResetting(true);
    setResetResult(null);
    setCopied(null);
    setError(null);
    try {
      setResetResult(await resetPersonPassword(signup.$key));
      await load();
    } catch (err) {
      setError(
        (err instanceof ApiError && err.detail) ||
          "Could not reset this password.",
      );
    } finally {
      setResetting(false);
    }
  };

  const copyTempPassword = () => {
    if (!resetResult || !navigator.clipboard) return setCopied(false);
    navigator.clipboard
      .writeText(resetResult.tempPassword)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };
  const roleItems =
    detail?.consequences.filter((c) => c.group === "role") ?? [];
  const mailItems =
    detail?.consequences.filter((c) => c.group === "mailbox") ?? [];
  const extraRoles =
    detail?.roles?.filter((role) => !detail.managedRoles.includes(role)) ?? [];

  const deleteItems: ConfirmItem[] = [
    ...(signup
      ? [
          {
            id: "account",
            title: `Delete the login account (${signup.username ?? "no username"})`,
            detail:
              "Their Keycloak account goes for good and they can no longer sign in.",
            fixed: true,
          },
          {
            id: "mailbox",
            title: "Their mailbox is kept, read-only",
            detail:
              "Mail is never deleted here, and the address is never reissued.",
            fixed: true,
          },
        ]
      : []),
    ...(detail?.exec
      ? [
          {
            id: "tile",
            title: "Delete their team page tile",
            detail: signup
              ? "Leave this unticked to keep them on the past executives list."
              : "The tile is removed from the team page. This cannot be undone.",
            fixed: !signup,
          },
        ]
      : []),
  ];

  return (
    <div className="flex animate-fade-in flex-col gap-5">
      <div>
        <Button onClick={onBack} type="button" variant="link">
          ← All people
        </Button>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold text-ink">{person.name}</h1>
          {person.title && <Pill>{person.title}</Pill>}
          {person.isCurrentExec === false && <Pill>Past</Pill>}
          {person.status && person.status !== "approved" && (
            <Pill tone="accent">{person.status}</Pill>
          )}
        </div>
      </div>

      {error && <Note>{error}</Note>}
      {result && <Note>{summary(result) || "Nothing changed."}</Note>}
      {detail && !detail.identitiesEditable && (
        <Note>
          This environment shares the live Keycloak realm and mail server, so
          role and mailbox changes are rehearsed here, not written: you see
          exactly what would happen, and nothing reaches a real account. Editing
          account details or the tile still saves here — only the matching
          Keycloak account is left untouched.
        </Note>
      )}

      {!detail && !error && <p className="text-subtle">Loading...</p>}

      {detail && (
        <>
          <Panel
            action={
              signup && !editingDetails ? (
                <Button
                  onClick={() => setEditingDetails(true)}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  Edit
                </Button>
              ) : undefined
            }
            note="How they sign in."
            title="Account"
          >
            {signup ? (
              renamePreview ? (
                <Confirm
                  confirmLabel={renamePreview.rehearsal ? "Rehearse" : "Rename"}
                  intro={
                    renamePreview.rehearsal
                      ? "This environment only rehearses: nothing below would actually happen here."
                      : `Renaming ${person.name} to ${renamePreview.to} does all of this. It takes a few minutes and cannot be undone once their old login is disabled.`
                  }
                  items={renamePreview.preview}
                  onApply={confirmRename}
                  onCancel={() => setRenamePreview(null)}
                  title={`Rename to ${renamePreview.to}`}
                />
              ) : editingDetails ? (
                <DetailsForm
                  identitiesEditable={detail.identitiesEditable}
                  onCancel={() => setEditingDetails(false)}
                  onRename={migrating || isSelf ? undefined : requestRename}
                  onSaved={async () => {
                    setEditingDetails(false);
                    await load();
                    await onChanged();
                  }}
                  signup={signup}
                />
              ) : (
                <div className="flex flex-col gap-4">
                  <Rows
                    items={[
                      [
                        "Username",
                        <span key="u">
                          <span className="font-mono">
                            {signup.username ?? "—"}
                          </span>
                          {signup.previousUsernames?.length ? (
                            <span className="ml-2 text-subtle">
                              was {signup.previousUsernames.join(", ")}
                            </span>
                          ) : null}
                        </span>,
                      ],
                      [
                        "Name",
                        [signup.firstName, signup.lastName]
                          .filter(Boolean)
                          .join(" ") || "—",
                      ],
                      ["Email", signup.email ?? "—"],
                      ["Phone", signup.phone ?? "—"],
                      ["Student ID", signup.studentId ?? "—"],
                      ["Access card ID", signup.accessCardId ?? "—"],
                      ["Status", signup.status ?? "—"],
                      ["Signed up", date(signup.submittedAt)],
                      [
                        "Reviewed",
                        signup.reviewedBy
                          ? `${signup.reviewedBy} · ${date(signup.reviewedAt)}`
                          : "—",
                      ],
                      [
                        "Keycloak",
                        signup.keycloakUserId ? "Linked" : "Not linked",
                      ],
                      [
                        "Password",
                        signup.passwordResetRequired
                          ? "Temporary — must change at next sign-in"
                          : "Set by them",
                      ],
                    ]}
                  />

                  {signup.keycloakUserId && (
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        disabled={resetting}
                        onClick={() => void resetPassword()}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        {resetting ? "Resetting..." : "Reset password..."}
                      </Button>
                      <span className="min-w-0 flex-1 text-sm text-subtle">
                        Issues a temporary password they must change at next
                        sign-in.
                      </span>
                    </div>
                  )}

                  {resetResult && (
                    <div className="animate-rise-in rounded-[12px] border-2 border-line bg-tint p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-subtle">
                        Temporary password
                      </div>
                      <div className="my-1 break-all font-mono text-2xl font-extrabold tracking-wider text-brand">
                        {resetResult.tempPassword}
                      </div>
                      <Button
                        onClick={copyTempPassword}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {copied ? "Copied" : "Copy"}
                      </Button>
                      {copied === false && (
                        <p className="mt-2 text-xs text-subtle">
                          Copying failed — select it above and copy by hand.
                        </p>
                      )}
                      <p className="mt-3 text-sm text-ink">
                        {resetResult.rehearsed
                          ? "Rehearsed only: this environment shares the live Keycloak realm and mail server, so nothing was changed and nothing was emailed."
                          : resetResult.rename
                            ? "For their new login once the change completes; it is also in the cut-over email. This is the only time it's shown here."
                            : `Also emailed to ${[signup.email, detail.mailbox.address].filter(Boolean).join(" and ")}. This is the only time it's shown here.`}
                      </p>
                    </div>
                  )}
                </div>
              )
            ) : (
              <p className="text-sm text-subtle">
                No login account. This is a team page tile on its own; an
                account gets linked to it when someone signs up under this name
                and is approved.
              </p>
            )}
          </Panel>

          <Panel
            note="Realm roles carry the authority. Each one is granted and revoked on its own."
            title="Roles & permissions"
          >
            {detail.roles === null ? (
              <p className="text-sm text-subtle">
                {signup?.keycloakUserId
                  ? "Keycloak could not be reached, so roles are unknown."
                  : "There is no Keycloak account to hold roles."}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {detail.managedRoles.map((role) => {
                  const item = roleItems.find((c) =>
                    c.id.startsWith(`role:${role}:`),
                  );
                  const held = detail.roles?.includes(role);
                  return (
                    <div
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border-2 border-line bg-raised px-3 py-2"
                      key={role}
                    >
                      <div className="min-w-0">
                        <span className="font-mono text-sm font-bold text-ink">
                          {role}
                        </span>
                        <span className="ml-2 text-xs font-bold uppercase tracking-wide text-subtle">
                          {held ? "held" : "not held"}
                        </span>
                        <p className="text-sm text-subtle">
                          {item?.blocked ?? item?.detail}
                        </p>
                      </div>
                      {item && (
                        <Button
                          disabled={!!item.blocked || !!working}
                          onClick={() => void confirmRole(item, role, !!held)}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          {working === item.id
                            ? "Working..."
                            : held
                              ? "Revoke"
                              : "Grant"}
                        </Button>
                      )}
                    </div>
                  );
                })}
                {extraRoles.length > 0 && (
                  <p className="text-sm text-subtle">
                    Also holds{" "}
                    <span className="font-mono text-ink">
                      {extraRoles.join(", ")}
                    </span>
                    . These come from the roles above or from Keycloak directly.
                  </p>
                )}
              </div>
            )}
          </Panel>

          <Panel note="Their mailbox on the club domain." title="Mailbox">
            {detail.mailbox.address ? (
              <div className="flex flex-col gap-3">
                <Rows
                  items={[
                    [
                      "Address",
                      <span className="font-mono" key="a">
                        {detail.mailbox.address}
                      </span>,
                    ],
                    [
                      "Mailbox",
                      detail.mailbox.provisioned === null
                        ? "Unknown here"
                        : detail.mailbox.provisioned
                          ? "Provisioned"
                          : "Not created yet",
                    ],
                    [
                      "Sending",
                      detail.mailbox.readOnly
                        ? "Read-only (past executive)"
                        : "Allowed",
                    ],
                  ]}
                />
                {user?.isMailAdmin &&
                  detail.mailbox.provisioned &&
                  signup?.username && (
                    <Button
                      asChild
                      className="self-start"
                      size="sm"
                      variant="secondary"
                    >
                      <Link href={withAs("/admin/mail", signup.username)}>
                        <Inbox aria-hidden />
                        Open inbox
                      </Link>
                    </Button>
                  )}
                {detail.mailbox.protected && (
                  <Note>
                    This is a protected service account. It can never be
                    deprovisioned from here.
                  </Note>
                )}
                <div className="flex flex-col gap-2">
                  {mailItems.map((item) => (
                    <div
                      className="flex flex-wrap items-center gap-3"
                      key={item.id}
                    >
                      <Button
                        disabled={!!item.blocked || !!working}
                        onClick={() => void apply([item.id])}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        {working === item.id ? "Working..." : item.title}
                      </Button>
                      <span className="min-w-0 flex-1 text-sm text-subtle">
                        {item.blocked ?? item.detail}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-subtle">
                No username, so there is no mailbox to manage.
              </p>
            )}
          </Panel>

          {detail.migrations.length > 0 && (
            <Panel
              note="Username changes: the login and mailbox are copied, verified, then the old ones retired."
              title="Identity changes"
            >
              <div className="flex flex-col gap-4">
                {detail.migrations.map((migration, at) => (
                  <div
                    className="rounded-[10px] border-2 border-line bg-raised p-3"
                    key={migration.$key}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-sm font-bold text-ink">
                        {migration.from} → {migration.to}
                      </span>
                      <Pill
                        tone={migration.status === "failed" ? "accent" : "flat"}
                      >
                        {statusLabel(migration)}
                      </Pill>
                      <span className="text-xs text-subtle">
                        {migration.requestedBy === "self"
                          ? "asked for by them"
                          : "started by a co-president"}{" "}
                        · {date(migration.requestedAt)}
                        {migration.forwardUntil
                          ? ` · old address forwards until ${date(migration.forwardUntil)}`
                          : ""}
                      </span>
                    </div>
                    {migration.error && (
                      <p className="mt-2 text-sm font-bold text-destructive">
                        {migration.error}
                      </p>
                    )}
                    {(at === 0 || isLive(migration)) && (
                      <div className="mt-3">
                        <MigrationSteps migration={migration} />
                      </div>
                    )}
                    {(migration.canResume || migration.canAbort) && (
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        {migration.canResume && (
                          <Button
                            disabled={!!migrationBusy}
                            onClick={() =>
                              void driveMigration(migration.$key, "resume")
                            }
                            size="sm"
                            type="button"
                            variant="primary"
                          >
                            {migrationBusy === `${migration.$key}:resume`
                              ? "Resuming..."
                              : "Resume"}
                          </Button>
                        )}
                        {migration.canAbort && (
                          <Button
                            disabled={!!migrationBusy}
                            onClick={() =>
                              void driveMigration(migration.$key, "abort")
                            }
                            size="sm"
                            type="button"
                            variant="destructive"
                          >
                            {migrationBusy === `${migration.$key}:abort`
                              ? "Aborting..."
                              : "Abort"}
                          </Button>
                        )}
                        <span className="text-sm text-subtle">
                          {migration.status === "failed"
                            ? "Fix the cause, then resume; the failed step runs again."
                            : "The runner lost its lease, probably a deploy. Resume picks it back up."}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel
            note="Exactly what the team page shows."
            title="Public profile"
          >
            {detail.exec ? (
              <ProfileForm
                exec={detail.exec}
                key={detail.exec.$key}
                onSaved={async () => {
                  await load();
                  await onChanged();
                }}
              />
            ) : (
              <p className="text-sm text-subtle">
                No tile yet. One is created and linked when this sign-up is
                approved.
              </p>
            )}
          </Panel>

          {detail.transition && (
            <Panel
              note="Every effect is listed first, and you choose which ones to apply."
              title="Executive status"
            >
              {open === "transition" ? (
                <Confirm
                  confirmLabel="Apply"
                  intro={`This is everything that changes for ${person.name}. Untick anything you do not want.`}
                  items={detail.transition.ids.flatMap((id) => {
                    const found = detail.consequences.find((c) => c.id === id);
                    return found ? [found] : [];
                  })}
                  onApply={apply}
                  onCancel={() => setOpen(null)}
                  title={detail.transition.label}
                />
              ) : (
                <Button
                  disabled={!!working}
                  onClick={() => setOpen("transition")}
                  size="sm"
                  type="button"
                  variant="primary"
                >
                  {detail.transition.label}...
                </Button>
              )}
            </Panel>
          )}

          {deleteItems.length > 0 && (
            <Panel note="There is no undo for this." title="Delete">
              {detail.mailbox.protected ? (
                <Note>
                  {detail.mailbox.address} is a protected service account, so
                  this person cannot be deleted.
                </Note>
              ) : isSelf ? (
                <Note>
                  This is your own account. Another co-president has to delete
                  it.
                </Note>
              ) : open === "delete" ? (
                <Confirm
                  confirmLabel="Delete"
                  intro={`Removing ${person.name} does all of this.`}
                  items={deleteItems}
                  onApply={remove}
                  onCancel={() => setOpen(null)}
                  title={signup ? "Delete this account" : "Delete this tile"}
                />
              ) : (
                <Button
                  onClick={() => setOpen("delete")}
                  size="sm"
                  type="button"
                  variant="destructive"
                >
                  {signup ? "Delete account..." : "Delete tile..."}
                </Button>
              )}
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
