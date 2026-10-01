"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { withAs } from "../mail/inbox-picker";
import {
  applyToPerson,
  deleteAccount,
  deleteTile,
  fetchPerson,
  resetPersonPassword,
  type ApplyResult,
  type PasswordResetResult,
  type Person,
  type PersonDetail,
} from "./api";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { storedTerms } from "@/lib/execs/terms";
import { usePhone } from "@/lib/use-media-query";
import { useSession } from "../session";
import Confirm, { type ConfirmItem } from "./confirm";
import DetailsForm from "./details-form";
import ProfileForm from "./profile-form";
import { Note, Panel, Pill, Rows } from "./ui";
import { ask } from "../ask";
import { capabilitiesOf, impliedBy } from "@/lib/auth/capabilities";

const date = (value?: string) =>
  value ? new Date(value).toLocaleDateString() : "—";

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

/** The consequences that destroy something: they get an ask and destructive styling. */
const DESTRUCTIVE_MAIL = new Set(["mailbox:retire"]);

// Jump targets. html[data-admin] already pads scrolling by the sticky phone
// header (scroll-padding-top), so the margin is only breathing room.
const SECTION = "scroll-mt-2";

const sectionId = (name: string) => `person-${name}`;

const jumpTo = (name: string) => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document
    .getElementById(sectionId(name))
    ?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
};

/** The person header's loading state (also used by the page before people load). */
export function PersonSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-5" role="status">
      <span className="sr-only">Loading…</span>
      <div aria-hidden className="flex animate-pulse flex-col gap-3">
        <span className="h-7 w-1/2 rounded bg-line/10" />
        <span className="flex gap-2">
          <span className="h-6 w-20 rounded-full bg-line/10" />
          <span className="h-6 w-24 rounded-full bg-line/10" />
        </span>
      </div>
      {[0, 1].map((row) => (
        <div
          aria-hidden
          className="h-40 animate-pulse rounded-[16px] border-2 border-line/30"
          key={row}
        />
      ))}
    </div>
  );
}

export default function PersonView({
  person,
  onBack,
  onChanged,
  onDirtyChange,
}: {
  person: Person;
  onBack: () => void;
  onChanged: () => Promise<void>;
  /** Unsaved edits in the account or profile form (the leave guard). */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [open, setOpen] = useState<"transition" | "delete" | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<PasswordResetResult | null>(
    null,
  );
  const [copied, setCopied] = useState<boolean | null>(null);
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);
  const { user } = useSession();
  // Phones: D21's outline-destructive for reject/revoke/retire/delete. Desk
  // keeps today's buttons.
  const phone = usePhone();

  const dirty = detailsDirty || profileDirty;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

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

  const confirmRole = async (
    item: { id: string; title: string },
    role: string,
    held: boolean,
  ) => {
    const gains = capabilitiesOf(role);
    const also = impliedBy(role);
    const ok = await ask({
      title: item.title,
      detail:
        (held ? `${person.name} loses:` : `${person.name} gains:`) +
        (also.length
          ? `\n(This role carries ${also.join(" and ")} with it.)`
          : ""),
      items: gains.map((c) => `${c.label} — ${c.detail}`),
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

  const applyMail = async (item: {
    id: string;
    title: string;
    detail: string;
  }) => {
    if (DESTRUCTIVE_MAIL.has(item.id)) {
      const address = detail?.mailbox.address ?? "this mailbox";
      const ok = await ask({
        title: `Retire ${address}?`,
        detail: item.detail,
        confirmLabel: "Retire mailbox",
        destructive: true,
      });
      if (ok === null) return;
    }
    await apply([item.id]);
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

  const signup = detail?.signup;
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
            title: "Their mailbox is destroyed",
            detail:
              "Mail sent to their address forwards to the co-presidents for 30 days, then stops.",
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

  const jumps = detail
    ? [
        { name: "account", label: "Account" },
        { name: "roles", label: "Roles" },
        { name: "mailbox", label: "Mailbox" },
        { name: "profile", label: "Public profile" },
        ...(detail.transition ? [{ name: "status", label: "Status" }] : []),
        ...(deleteItems.length > 0
          ? [{ name: "delete", label: "Delete" }]
          : []),
      ]
    : [];

  const exec = detail?.exec;
  const profileSummary = exec
    ? [
        exec.title,
        storedTerms(exec)[0],
        exec.hidden ? "Hidden from the team page" : "On the team page",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div className="flex animate-fade-in flex-col gap-5">
      <div>
        {/* Phones go back from the header (spec §3.6). */}
        <Button
          className="hidden desk:inline-flex"
          onClick={onBack}
          type="button"
          variant="link"
        >
          ← All people
        </Button>
        <div className="flex flex-wrap items-center gap-3 desk:mt-2">
          <h1
            className="text-2xl font-extrabold text-ink outline-none phone:sr-only"
            data-stack-heading
            tabIndex={-1}
          >
            {person.name}
          </h1>
          {person.title && <Pill>{person.title}</Pill>}
          {person.term && <Pill>{person.term}</Pill>}
          {person.isCurrentExec === false && <Pill>Past</Pill>}
          {person.status && person.status !== "approved" && (
            <Pill tone="accent">{person.status}</Pill>
          )}
        </div>
      </div>

      {jumps.length > 0 && (
        <nav
          aria-label="Sections"
          className="-mx-4 -my-1 flex gap-2 overflow-x-auto overscroll-x-contain px-4 py-1 [scrollbar-width:none] md:hidden"
        >
          {jumps.map(({ name, label }) => (
            <button
              className="press-flat min-h-11 shrink-0 rounded-full border-2 border-line bg-surface px-4 text-sm font-bold text-ink"
              key={name}
              onClick={() => jumpTo(name)}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>
      )}

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

      {!detail && !error && (
        <div aria-busy="true" className="flex flex-col gap-5" role="status">
          <span className="sr-only">Loading…</span>
          {[0, 1].map((row) => (
            <div
              aria-hidden
              className="h-40 animate-pulse rounded-[16px] border-2 border-line/30"
              key={row}
            />
          ))}
        </div>
      )}

      {detail && (
        <>
          <div className={SECTION} id={sectionId("account")}>
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
                editingDetails ? (
                  <DetailsForm
                    identitiesEditable={detail.identitiesEditable}
                    onCancel={() => setEditingDetails(false)}
                    onDirtyChange={setDetailsDirty}
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
                          <span className="font-mono" key="u">
                            {signup.username ?? "—"}
                          </span>,
                        ],
                        [
                          "Name",
                          [signup.firstName, signup.lastName]
                            .filter(Boolean)
                            .join(" ") || "—",
                        ],
                        [
                          "Email",
                          signup.email ? (
                            <a
                              className="underline-offset-4 hover:underline pointer-coarse:-my-2.5 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:max-w-full pointer-coarse:items-center"
                              href={`mailto:${signup.email}`}
                              key="e"
                            >
                              {signup.email}
                            </a>
                          ) : (
                            "—"
                          ),
                        ],
                        [
                          "Phone",
                          signup.phone ? (
                            <a
                              className="underline-offset-4 hover:underline pointer-coarse:-my-2.5 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:max-w-full pointer-coarse:items-center"
                              href={`tel:${signup.phone}`}
                              key="p"
                            >
                              {signup.phone}
                            </a>
                          ) : (
                            "—"
                          ),
                        ],
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
                      <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
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
                        <div className="text-xs font-semibold tracking-wide text-subtle uppercase">
                          Temporary password
                        </div>
                        <div className="my-1 font-mono text-2xl font-extrabold tracking-wider break-all text-brand">
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
                          <p className="mt-2 text-sm text-subtle pointer-fine:text-xs">
                            Copying failed — select it above and copy by hand.
                          </p>
                        )}
                        <p className="mt-3 text-sm text-ink">
                          {resetResult.rehearsed
                            ? "Rehearsed only: this environment shares the live Keycloak realm and mail server, so nothing was changed and nothing was emailed."
                            : `Also emailed to ${[signup.email, detail.mailbox.address].filter(Boolean).join(" and ")}. This is the only time it's shown here.`}
                        </p>
                      </div>
                    )}
                  </div>
                )
              ) : (
                <p className="text-sm text-subtle">
                  No login account. This is a team page tile on its own; an
                  account gets linked to it when someone signs up under this
                  name and is approved.
                </p>
              )}
            </Panel>
          </div>

          <div className={SECTION} id={sectionId("roles")}>
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
                          <span className="ml-2 text-xs font-bold tracking-wide text-subtle uppercase">
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
                            variant={
                              held && phone
                                ? "outline-destructive"
                                : "secondary"
                            }
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
                      . These come from the roles above or from Keycloak
                      directly.
                    </p>
                  )}
                </div>
              )}
            </Panel>
          </div>

          <div className={SECTION} id={sectionId("mailbox")}>
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
                        detail.mailbox.retiredUntil
                          ? `Retired — forwards to the co-presidents until ${date(detail.mailbox.retiredUntil)}`
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
                  <div className="flex flex-col gap-4 sm:gap-2">
                    {mailItems.map((item) => {
                      const destructive = DESTRUCTIVE_MAIL.has(item.id);
                      return (
                        <div
                          className="flex flex-col items-start gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3"
                          key={item.id}
                        >
                          <Button
                            className="max-w-full"
                            disabled={!!item.blocked || !!working}
                            onClick={() => void applyMail(item)}
                            size="sm"
                            type="button"
                            variant={
                              destructive && phone
                                ? "outline-destructive"
                                : "secondary"
                            }
                          >
                            <span className="truncate">
                              {working === item.id ? "Working..." : item.title}
                            </span>
                          </Button>
                          <span className="min-w-0 flex-1 text-sm wrap-anywhere text-subtle">
                            {item.blocked ?? item.detail}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-subtle">
                  No username, so there is no mailbox to manage.
                </p>
              )}
            </Panel>
          </div>

          <div className={SECTION} id={sectionId("profile")}>
            <Panel
              note="Exactly what the team page shows."
              title="Public profile"
            >
              {exec ? (
                <>
                  {/* Below md the long form waits behind a button, like
                      Account's Edit. It stays mounted, so edits survive. */}
                  {!editingProfile && (
                    <div className="flex flex-col items-start gap-3 md:hidden">
                      <p className="text-sm font-semibold wrap-anywhere text-ink">
                        {profileSummary}
                      </p>
                      <Button
                        onClick={() => setEditingProfile(true)}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        Edit public profile
                      </Button>
                    </div>
                  )}
                  <div className={editingProfile ? "" : "max-md:hidden"}>
                    <ProfileForm
                      exec={exec}
                      key={exec.$key}
                      onDirtyChange={setProfileDirty}
                      onSaved={async () => {
                        await load();
                        await onChanged();
                      }}
                    />
                  </div>
                </>
              ) : (
                <p className="text-sm text-subtle">
                  No tile yet. One is created and linked when this sign-up is
                  approved.
                </p>
              )}
            </Panel>
          </div>

          {detail.transition && (
            <div className={SECTION} id={sectionId("status")}>
              <Panel
                note="Every effect is listed first, and you choose which ones to apply."
                title="Executive status"
              >
                {open === "transition" ? (
                  <Confirm
                    confirmLabel="Apply"
                    intro={`This is everything that changes for ${person.name}. Untick anything you do not want.`}
                    items={detail.transition.ids.flatMap((id) => {
                      const found = detail.consequences.find(
                        (c) => c.id === id,
                      );
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
            </div>
          )}

          {deleteItems.length > 0 && (
            <div className={SECTION} id={sectionId("delete")}>
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
                    destructive
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
                    variant={phone ? "outline-destructive" : "destructive"}
                  >
                    {signup ? "Delete account..." : "Delete tile..."}
                  </Button>
                )}
              </Panel>
            </div>
          )}
        </>
      )}
    </div>
  );
}
