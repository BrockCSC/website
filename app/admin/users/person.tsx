"use client";

import { useCallback, useEffect, useState } from "react";
import {
  applyToPerson,
  deleteAccount,
  deleteTile,
  fetchPerson,
  type ApplyResult,
  type Person,
  type PersonDetail,
} from "./api";
import { Button } from "@/components/ui/button";
import { useSession } from "../session";
import Confirm, { type ConfirmItem } from "./confirm";
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
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [open, setOpen] = useState<"transition" | "delete" | null>(null);
  const [working, setWorking] = useState<string | null>(null);
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

  const signup = detail?.signup;
  const isSelf =
    !!signup?.keycloakUserId && signup.keycloakUserId === user?.sub;
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
          exactly what would happen, and nothing reaches a real account. Tile
          changes are real.
        </Note>
      )}

      {!detail && !error && <p className="text-subtle">Loading...</p>}

      {detail && (
        <>
          <Panel note="How they sign in." title="Account">
            {signup ? (
              <Rows
                items={[
                  [
                    "Username",
                    <span className="font-mono" key="u">
                      {signup.username ?? "—"}
                    </span>,
                  ],
                  ["Email", signup.email ?? "—"],
                  ["Phone", signup.phone ?? "—"],
                  ["Student ID", signup.studentId ?? "—"],
                  ["Status", signup.status ?? "—"],
                  ["Signed up", date(signup.submittedAt)],
                  [
                    "Reviewed",
                    signup.reviewedBy
                      ? `${signup.reviewedBy} · ${date(signup.reviewedAt)}`
                      : "—",
                  ],
                  ["Keycloak", signup.keycloakUserId ? "Linked" : "Not linked"],
                ]}
              />
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
