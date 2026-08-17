"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchInviteCode, reviewSignup } from "@/lib/api";
import { grantsApproval } from "@/lib/execs/titles";
import { Button } from "@/components/ui/button";
import { useSession } from "../session";
import { useHandoff } from "../palette";
import {
  buildPeople,
  fetchExecs,
  fetchPeopleSignups,
  reviewMailDeletion,
  reviewMailLimit,
  searchPeople,
  type Exec,
  type Person,
  type Signup,
} from "./api";
import Confirm from "./confirm";
import PersonView from "./person";
import ProfileForm from "./profile-form";
import { Note, Panel, Pill, field } from "./ui";

type Scope = "all" | "current" | "past" | "pending" | "unlinked";

const SCOPES: { id: Scope; label: string; match: (p: Person) => boolean }[] = [
  { id: "all", label: "Everyone", match: () => true },
  {
    id: "current",
    label: "Current",
    match: (p) => !!p.execKey && p.isCurrentExec !== false,
  },
  { id: "past", label: "Past", match: (p) => p.isCurrentExec === false },
  { id: "pending", label: "Pending", match: (p) => p.status === "pending" },
  { id: "unlinked", label: "No account", match: (p) => !p.signupKey },
];

const humanise = (ms: number): string => {
  const units = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ] as const;
  for (const [name, size] of units) {
    const count = Math.floor(ms / size);
    if (count >= 1) return `${count} ${name}${count === 1 ? "" : "s"}`;
  }
  return "under a minute";
};

const fullName = (signup: Signup) =>
  [signup.firstName, signup.lastName].filter(Boolean).join(" ") ||
  (signup.username ?? "Unnamed");

export default function UsersPage() {
  const { user } = useSession();
  const [execs, setExecs] = useState<Exec[]>([]);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [invite, setInvite] = useState<{
    code: string;
    expiresInMs: number;
  } | null>(null);
  const [tab, setTab] = useState<
    "directory" | "pending" | "limits" | "deletions"
  >("directory");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [rejecting, setRejecting] = useState<Signup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [nextExecs, nextSignups] = await Promise.all([
        fetchExecs(),
        fetchPeopleSignups(),
      ]);
      setExecs(nextExecs);
      setSignups(nextSignups);
      setError(null);
    } catch {
      setError("Could not load people right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
      setInvite(await fetchInviteCode().catch(() => null));
    })();
  }, [load]);

  useHandoff("person", setSelected);
  useHandoff(
    "pending",
    useCallback(() => setTab("pending"), []),
  );

  const people = useMemo(() => buildPeople(execs, signups), [execs, signups]);
  const shown = useMemo(() => {
    const matcher = SCOPES.find((s) => s.id === scope)!.match;
    return searchPeople(people.filter(matcher), query);
  }, [people, scope, query]);

  const pending = signups.filter((signup) => signup.status === "pending");
  const limitRequests = signups.filter(
    (signup) => signup.mailLimitRequest?.status === "pending",
  );
  const deletionRequests = signups.flatMap((signup) =>
    (signup.mailDeletionRequests ?? [])
      .filter((request) => request.status === "pending")
      .map((request) => ({ signup, request })),
  );
  const person = people.find((p) => p.id === selected) ?? null;

  const review = async (signup: Signup, action: "approve" | "reject") => {
    try {
      await reviewSignup(signup.$key, action);
      setRejecting(null);
      await load();
    } catch {
      setError(`Could not ${action} ${fullName(signup)}.`);
    }
  };

  const reviewLimit = async (signup: Signup, action: "approve" | "decline") => {
    try {
      await reviewMailLimit(signup.$key, action);
      await load();
    } catch {
      setError(`Could not ${action} the request from ${fullName(signup)}.`);
    }
  };

  const reviewDeletion = async (
    signup: Signup,
    requestId: string,
    action: "approve" | "decline",
  ) => {
    try {
      await reviewMailDeletion(signup.$key, requestId, action);
      await load();
    } catch {
      setError(`Could not ${action} the deletion from ${fullName(signup)}.`);
    }
  };

  if (!user?.isApprover) {
    return (
      <div className="mx-auto w-full max-w-[1060px] px-5 py-8">
        <Note>Only a co-president can manage people.</Note>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1060px] px-5 py-8">
      {person ? (
        <PersonView
          key={person.id}
          onBack={() => setSelected(null)}
          onChanged={load}
          person={person}
        />
      ) : (
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="text-2xl font-extrabold text-ink">People</h1>
            <p className="mt-1 text-subtle">
              Accounts, roles, public profiles and mailboxes.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setTab("directory")}
              size="sm"
              type="button"
              variant={tab === "directory" ? "primary" : "secondary"}
            >
              Directory ({people.length})
            </Button>
            <Button
              onClick={() => setTab("pending")}
              size="sm"
              type="button"
              variant={tab === "pending" ? "primary" : "secondary"}
            >
              Pending sign-ups ({pending.length})
            </Button>
            <Button
              onClick={() => setTab("limits")}
              size="sm"
              type="button"
              variant={tab === "limits" ? "primary" : "secondary"}
            >
              Send limits ({limitRequests.length})
            </Button>
            <Button
              onClick={() => setTab("deletions")}
              size="sm"
              type="button"
              variant={tab === "deletions" ? "primary" : "secondary"}
            >
              Deletions ({deletionRequests.length})
            </Button>
          </div>

          {error && <Note>{error}</Note>}

          {tab === "directory" ? (
            <>
              <Panel
                action={
                  <Button
                    onClick={() => setAdding(!adding)}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    {adding ? "Cancel" : "Add a tile"}
                  </Button>
                }
                note="Search by name, username, email, role or status."
                title="Find someone"
              >
                <input
                  aria-label="Search people"
                  className={field}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. treasurer, pending, @brocku"
                  type="search"
                  value={query}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {SCOPES.map((option) => (
                    <Button
                      key={option.id}
                      onClick={() => setScope(option.id)}
                      size="xs"
                      type="button"
                      variant={scope === option.id ? "primary" : "secondary"}
                    >
                      {option.label} ({people.filter(option.match).length})
                    </Button>
                  ))}
                </div>
                {adding && (
                  <div className="mt-4 animate-rise-in rounded-[10px] border-2 border-line bg-raised p-4">
                    <ProfileForm
                      onCancel={() => setAdding(false)}
                      onSaved={async (saved) => {
                        setAdding(false);
                        await load();
                        setSelected(saved.$key);
                      }}
                    />
                  </div>
                )}
              </Panel>

              {loading && <p className="text-subtle">Loading...</p>}
              {!loading && !shown.length && (
                <p className="text-subtle">Nobody matches that.</p>
              )}

              <ul className="flex animate-fade-in flex-col gap-2" key={scope}>
                {shown.map((entry) => (
                  <li key={entry.id}>
                    <button
                      className="w-full rounded-[10px] border-2 border-line bg-surface px-4 py-3 text-left shadow-brut-sm hover:bg-tint"
                      onClick={() => setSelected(entry.id)}
                    >
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-extrabold text-ink">
                          {entry.name}
                        </span>
                        {entry.title && (
                          <span className="text-sm font-semibold text-subtle">
                            {entry.title}
                          </span>
                        )}
                        {entry.isCurrentExec === false && <Pill>Past</Pill>}
                        {entry.status && entry.status !== "approved" && (
                          <Pill tone="accent">{entry.status}</Pill>
                        )}
                        {!entry.signupKey && <Pill>No account</Pill>}
                      </span>
                      <span className="mt-1 block truncate text-sm text-subtle">
                        <span className="font-mono">
                          {entry.username ?? "—"}
                        </span>
                        {entry.email ? ` · ${entry.email}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              <Panel
                note={
                  invite
                    ? `Rotates in ${humanise(invite.expiresInMs)}. Share it with execs who need an account.`
                    : "Unavailable right now."
                }
                title="Invite code"
              >
                <span className="font-mono text-3xl font-extrabold tracking-[0.2em] text-brand">
                  {invite?.code ?? "————"}
                </span>
              </Panel>
            </>
          ) : tab === "pending" ? (
            <>
              {!pending.length && (
                <p className="text-subtle">No sign-ups are waiting.</p>
              )}
              {pending.map((signup) => {
                const match = signup.matchedExec;
                return (
                  <Panel
                    key={signup.$key}
                    note={[signup.email, signup.phone, signup.studentId]
                      .filter(Boolean)
                      .join(" · ")}
                    title={fullName(signup)}
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-mono text-sm text-ink">
                          {signup.username}
                        </span>
                        {signup.isFormerExec && <Pill>Former exec</Pill>}
                        {signup.confirmationCode && (
                          <span className="font-mono text-lg font-extrabold tracking-[0.2em] text-brand">
                            {signup.confirmationCode}
                          </span>
                        )}
                      </div>

                      <p className="text-sm text-subtle">
                        {!match &&
                          "No matching tile — approving creates a new one."}
                        {match?.claimed &&
                          `Claims ${match.name}, already held by another account. Approving creates a separate tile.`}
                        {match && !match.claimed && (
                          <>
                            Claims the existing tile for{" "}
                            <strong className="text-ink">
                              {match.name}
                              {match.title ? ` — ${match.title}` : ""}
                            </strong>
                            . Approving enables their login, grants the
                            executive role and provisions their mailbox.
                          </>
                        )}
                      </p>

                      {grantsApproval(match?.title) && !match?.claimed && (
                        <Note>
                          This also grants approval rights over everyone else.
                          Check the confirmation code with them first.
                        </Note>
                      )}

                      {rejecting?.$key === signup.$key ? (
                        <Confirm
                          confirmLabel="Reject"
                          intro={`Rejecting ${fullName(signup)} cannot be undone.`}
                          items={[
                            {
                              id: "keycloak",
                              title: "Delete their Keycloak account",
                              detail:
                                "The username is freed up and they would have to sign up again.",
                              fixed: true,
                            },
                          ]}
                          onApply={() => review(signup, "reject")}
                          onCancel={() => setRejecting(null)}
                          title="Reject this sign-up"
                        />
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            onClick={() => void review(signup, "approve")}
                            size="sm"
                            type="button"
                            variant="primary"
                          >
                            Approve
                          </Button>
                          <Button
                            onClick={() => setRejecting(signup)}
                            size="sm"
                            type="button"
                            variant="destructive"
                          >
                            Reject...
                          </Button>
                        </div>
                      )}
                    </div>
                  </Panel>
                );
              })}
            </>
          ) : tab === "limits" ? (
            <>
              {!limitRequests.length && (
                <p className="text-subtle">
                  No one is asking to send more mail.
                </p>
              )}
              {limitRequests.map((signup) => {
                const request = signup.mailLimitRequest!;
                return (
                  <Panel
                    key={signup.$key}
                    note={[signup.username, signup.email]
                      .filter(Boolean)
                      .join(" · ")}
                    title={fullName(signup)}
                  >
                    <div className="flex flex-col gap-3">
                      <p className="text-sm text-subtle">
                        Wants{" "}
                        <strong className="text-ink">
                          {request.requested} messages a day
                        </strong>
                        {signup.mailDailyLimit
                          ? `, up from their ${signup.mailDailyLimit}.`
                          : ", up from the club default."}{" "}
                        Outbound mail is metered, so approving raises what the
                        club can be billed for.
                      </p>
                      {request.reason && (
                        <p className="text-sm text-ink">“{request.reason}”</p>
                      )}

                      {signup.keycloakUserId === user.sub ? (
                        <Note>
                          Another co-president has to review your own request.
                        </Note>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            onClick={() => void reviewLimit(signup, "approve")}
                            size="sm"
                            type="button"
                            variant="primary"
                          >
                            Approve
                          </Button>
                          <Button
                            onClick={() => void reviewLimit(signup, "decline")}
                            size="sm"
                            type="button"
                            variant="destructive"
                          >
                            Decline
                          </Button>
                        </div>
                      )}
                    </div>
                  </Panel>
                );
              })}
            </>
          ) : (
            <>
              {!deletionRequests.length && (
                <p className="text-subtle">
                  No one is asking to destroy a message.
                </p>
              )}
              {deletionRequests.map(({ signup, request }) => (
                <Panel
                  key={request.id}
                  note={[signup.username, signup.email]
                    .filter(Boolean)
                    .join(" · ")}
                  title={fullName(signup)}
                >
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-subtle">
                      Wants{" "}
                      <strong className="text-ink">
                        “{request.subject || "(no subject)"}”
                      </strong>{" "}
                      destroyed for good. Approving does it the next time they
                      open Mail, and it cannot be recovered after that.
                    </p>
                    {request.reason && (
                      <p className="text-sm text-ink">“{request.reason}”</p>
                    )}

                    {signup.keycloakUserId === user.sub ? (
                      <Note>
                        Another co-president has to review your own request.
                      </Note>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() =>
                            void reviewDeletion(signup, request.id, "approve")
                          }
                          size="sm"
                          type="button"
                          variant="primary"
                        >
                          Approve
                        </Button>
                        <Button
                          onClick={() =>
                            void reviewDeletion(signup, request.id, "decline")
                          }
                          size="sm"
                          type="button"
                          variant="destructive"
                        >
                          Decline
                        </Button>
                      </div>
                    )}
                  </div>
                </Panel>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
