"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Copy, UserPlus } from "lucide-react";
import { Fab } from "@/components/ui/fab";
import { fetchInviteCode, reviewSignup } from "@/lib/api";
import { grantsApproval } from "@/lib/execs/titles";
import { Button } from "@/components/ui/button";
import { Segmented, segmentTabId } from "@/components/ui/segmented";
import { Sheet, type SheetCloseReason } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import {
  COARSE_QUERY,
  mediaMatches,
  useMediaQuery,
  usePhone,
} from "@/lib/use-media-query";
import { useStackParam } from "@/lib/use-stack-param";
import { cn } from "@/lib/utils";
import { ask, isAskOpen } from "../ask";
import { useTopBar } from "../chrome";
import { AdminPage } from "../page-frame";
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
import PersonView, { PersonSkeleton } from "./person";
import ProfileForm from "./profile-form";
import { Note, Panel, Pill, field } from "./ui";

type Scope = "all" | "current" | "past" | "pending" | "unlinked";
type Tab = "directory" | "pending" | "limits" | "deletions";

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

const panelId = (tab: Tab) => `people-panel-${tab}`;

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

/** One status chip for a phone row: the one that most needs attention. */
function RowChip({ entry }: { entry: Person }) {
  if (entry.status && entry.status !== "approved") {
    return <Pill tone="accent">{entry.status}</Pill>;
  }
  if (!entry.signupKey) return <Pill>No account</Pill>;
  if (entry.isCurrentExec === false) return <Pill>Past</Pill>;
  return null;
}

/** Email, phone and student ID as tappable lines (phones). */
function ContactLine({ signup }: { signup: Signup }) {
  const parts: React.ReactNode[] = [];
  if (signup.email) {
    parts.push(
      <a
        className="inline-flex min-h-11 max-w-full items-center underline underline-offset-4"
        href={`mailto:${signup.email}`}
        key="e"
      >
        {signup.email}
      </a>,
    );
  }
  if (signup.phone) {
    parts.push(
      <a
        className="inline-flex min-h-11 max-w-full items-center underline underline-offset-4"
        href={`tel:${signup.phone}`}
        key="p"
      >
        {signup.phone}
      </a>,
    );
  }
  if (signup.studentId) parts.push(<span key="s">{signup.studentId}</span>);
  if (!parts.length) return null;
  return (
    <p className="-my-2.5 flex flex-wrap items-center gap-x-4 text-sm wrap-anywhere text-subtle">
      {parts}
    </p>
  );
}

const stack =
  "flex flex-wrap gap-2 max-md:flex-col-reverse max-md:[&>*]:min-h-11 max-md:[&>*]:w-full";

export default function UsersPage() {
  const { user } = useSession();
  const phone = usePhone();
  // Below md the directory is a grouped list of two-line rows. One layout is
  // rendered at a time, so each name is in the DOM once.
  const compact = useMediaQuery("(max-width: 767.98px)");
  const [execs, setExecs] = useState<Exec[]>([]);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [invite, setInvite] = useState<{
    code: string;
    expiresInMs: number;
  } | null>(null);
  const [tab, setTab] = useState<Tab>("directory");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [adding, setAdding] = useState(false);
  const [addDirty, setAddDirty] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [rejecting, setRejecting] = useState<Signup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [personDirty, setPersonDirty] = useState(false);

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

  useHandoff(
    "pending",
    useCallback(() => setTab("pending"), []),
  );

  const people = useMemo(() => buildPeople(execs, signups), [execs, signups]);

  // Latest values for the stack hook's pop handler, which runs before the
  // person screen unmounts.
  const live = useRef({ dirty: false, people });
  useEffect(() => {
    live.current = { dirty: personDirty, people };
  });

  // Person detail is a pushed screen at every width (spec D4): Back returns
  // to the list, which stays mounted underneath.
  const person = useStackParam("person", {
    push: "always",
    kind: "page",
    // An edge swipe or browser Back isn't fought (D22), but say what it cost.
    onUserPop: (prev) => {
      if (!live.current.dirty) return;
      const name = live.current.people.find((p) => p.id === prev)?.name;
      toast({
        tone: "error",
        message: `Unsaved changes to ${name ?? "this person"} were discarded`,
      });
    },
  });
  const selected = person.value;
  const current = people.find((p) => p.id === selected) ?? null;

  // The top bar's back and the in-page link: ask before dropping edits.
  const guardedClose = async () => {
    if (live.current.dirty) {
      const ok = await ask({
        title: "Discard changes?",
        detail: "Your edits to this person haven't been saved.",
        confirmLabel: "Discard",
        destructive: true,
      });
      if (ok === null) return;
    }
    person.close();
  };

  const dirtyAnywhere = (selected != null && personDirty) || addDirty;
  useEffect(() => {
    if (!dirtyAnywhere) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyAnywhere]);

  useTopBar({
    title: "People",
    docTitle: "People",
  });
  useTopBar(
    {
      back: { label: "People", onBack: () => void guardedClose() },
      title: current?.name ?? "Person",
      docTitle: current?.name,
    },
    { active: selected != null },
  );

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

  const run = async (
    key: string,
    work: () => Promise<void>,
    failure: string,
    success?: string,
  ) => {
    setBusy(key);
    setError(null);
    try {
      await work();
      await load();
      if (success) toast({ message: success });
    } catch {
      setError(failure);
      toast({ tone: "error", message: failure });
    } finally {
      setBusy(null);
    }
  };

  const review = (signup: Signup, action: "approve" | "reject") =>
    run(
      `${signup.$key}:${action}`,
      async () => {
        await reviewSignup(signup.$key, action);
        setRejecting(null);
      },
      `Could not ${action} ${fullName(signup)}.`,
      `${action === "approve" ? "Approved" : "Rejected"} ${fullName(signup)}`,
    );

  const approve = async (signup: Signup) => {
    const match = signup.matchedExec;
    if (grantsApproval(match?.title) && !match?.claimed) {
      const ok = await ask({
        title: `Approve ${fullName(signup)}?`,
        detail:
          "This also grants approval rights over everyone else. Check the confirmation code with them first." +
          (signup.confirmationCode
            ? `\n\nConfirmation code: ${signup.confirmationCode}`
            : ""),
        confirmLabel: "Approve",
      });
      if (ok === null) return;
    }
    await review(signup, "approve");
  };

  const reviewLimit = (signup: Signup, action: "approve" | "decline") =>
    run(
      `limit:${signup.$key}:${action}`,
      () => reviewMailLimit(signup.$key, action),
      `Could not ${action} the request from ${fullName(signup)}.`,
    );

  const reviewDeletion = (
    signup: Signup,
    requestId: string,
    action: "approve" | "decline",
  ) =>
    run(
      `deletion:${requestId}:${action}`,
      () => reviewMailDeletion(signup.$key, requestId, action),
      `Could not ${action} the deletion from ${fullName(signup)}.`,
    );

  const destroyMessage = async (
    signup: Signup,
    request: { id: string; subject?: string },
  ) => {
    const ok = await ask({
      title: "Destroy this message?",
      detail: `“${request.subject || "(no subject)"}” from ${fullName(signup)}'s mailbox is destroyed the next time they open Mail. It can't be recovered after that.`,
      confirmLabel: "Destroy message",
      destructive: true,
    });
    if (ok === null) return;
    await reviewDeletion(signup, request.id, "approve");
  };

  const copyInvite = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.code);
      toast({ message: "Invite code copied" });
      return;
    } catch {
      // No clipboard (insecure context, denied): try the share sheet.
    }
    try {
      if (navigator.share) {
        await navigator.share({ text: invite.code });
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
    toast({
      tone: "error",
      message: "Couldn't copy. Select the code instead.",
    });
  };

  const closeAdd = async (reason: SheetCloseReason) => {
    if (addSaving) return;
    if (reason === "backdrop") return;
    const explicit =
      reason === "close-button" ||
      (reason === "cancel" && !mediaMatches(COARSE_QUERY));
    if (addDirty && explicit) {
      if (isAskOpen()) return;
      const ok = await ask({
        title: "Discard this tile?",
        detail: "The new tile hasn't been created.",
        confirmLabel: "Discard",
        destructive: true,
      });
      if (ok === null) return;
    }
    setAdding(false);
  };

  const afterAdd = async (saved: Exec) => {
    setAdding(false);
    await load();
    person.open(saved.$key);
  };

  if (!user?.isApprover) {
    return (
      <AdminPage>
        <Note>Only a co-president can manage people.</Note>
      </AdminPage>
    );
  }

  const tabs: { id: Tab; label: string; shortLabel: string; count: number }[] =
    [
      {
        id: "directory",
        label: "Directory",
        shortLabel: "People",
        count: people.length,
      },
      {
        id: "pending",
        label: "Pending sign-ups",
        shortLabel: "Sign-ups",
        count: pending.length,
      },
      {
        id: "limits",
        label: "Send limits",
        shortLabel: "Limits",
        count: limitRequests.length,
      },
      {
        id: "deletions",
        label: "Deletions",
        shortLabel: "Deletions",
        count: deletionRequests.length,
      },
    ];

  // Phones: the tabs are a real tablist, and these are its panels.
  const panel = (id: Tab) =>
    phone
      ? {
          id: panelId(id),
          role: "tabpanel",
          "aria-labelledby": segmentTabId(panelId(id)),
        }
      : {};

  const filtered = query.trim() !== "" || scope !== "all";

  return (
    <AdminPage>
      {selected != null &&
        (current ? (
          <PersonView
            key={current.id}
            onBack={() => void guardedClose()}
            onChanged={load}
            onDirtyChange={setPersonDirty}
            person={current}
          />
        ) : loading ? (
          <PersonSkeleton />
        ) : (
          <div className="flex flex-col items-start gap-4">
            <h1
              className="text-2xl font-extrabold text-ink outline-none phone:sr-only"
              data-stack-heading
              tabIndex={-1}
            >
              Person not found
            </h1>
            <Note>That person isn&apos;t in the directory any more.</Note>
            <Button
              onClick={() => person.close()}
              size="sm"
              type="button"
              variant="secondary"
            >
              Back to people
            </Button>
          </div>
        ))}

      {/* The list stays mounted under a person, so its scroll and state
          survive the round trip. */}
      <div className={selected != null ? "hidden" : "flex flex-col gap-5"}>
        <div>
          <h1 className="text-2xl font-extrabold text-ink">People</h1>
          <p className="mt-1 text-subtle">
            Accounts, roles, public profiles and mailboxes.
          </p>
        </div>

        <Segmented
          className="desk:hidden max-sm:auto-cols-auto max-sm:[&_[role=tab]]:px-1 max-sm:[&_[role=tab]]:text-[13px] max-sm:[&_[role=tab]>span]:gap-1"
          label="People sections"
          mode="tabs"
          onChange={setTab}
          options={tabs.map(({ id, label, shortLabel, count }) => ({
            value: id,
            label,
            shortLabel,
            count: loading ? undefined : count,
            panelId: panelId(id),
          }))}
          value={tab}
        />

        <div className="flex flex-wrap gap-2 phone:hidden">
          {tabs.map(({ id, label, count }) => (
            <Button
              key={id}
              onClick={() => setTab(id)}
              size="sm"
              type="button"
              variant={tab === id ? "primary" : "secondary"}
            >
              {label} ({count})
            </Button>
          ))}
        </div>

        {error && <Note>{error}</Note>}

        {tab === "directory" ? (
          <div className="flex flex-col gap-5" {...panel("directory")}>
            {/* Phones: one row with Copy instead of a whole panel. */}
            <div className="flex items-center gap-3 rounded-[16px] border-2 border-line bg-surface py-1.5 pr-1.5 pl-4 md:hidden">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold tracking-wide text-subtle uppercase">
                  Invite code
                  {invite && (
                    <span className="font-semibold tracking-normal normal-case">
                      {" "}
                      · rotates in {humanise(invite.expiresInMs)}
                    </span>
                  )}
                </p>
                <p className="truncate font-mono text-lg font-extrabold tracking-[0.12em] text-brand select-all">
                  {invite?.code ?? "————"}
                </p>
              </div>
              <button
                aria-label="Copy invite code"
                className="press-flat flex min-h-11 shrink-0 items-center gap-1.5 rounded-[10px] px-3 font-bold text-ink disabled:opacity-40"
                disabled={!invite}
                onClick={() => void copyInvite()}
                type="button"
              >
                <Copy aria-hidden className="size-4" />
                Copy
              </button>
            </div>

            <div className="max-md:hidden">
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
            </div>

            {/* Phones: a sticky search band under the header (D1 sticky
                rule, D21 chrome colour). */}
            <div className="sticky top-[var(--admin-top)] z-20 -mx-4 flex flex-col gap-2.5 border-b-2 border-line bg-surface px-4 pt-3 pb-2.5 sm:-mx-5 sm:px-5 desk:hidden">
              <input
                aria-label="Search people"
                autoCapitalize="none"
                autoCorrect="off"
                className={field}
                enterKeyHint="search"
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, role, email or status"
                spellCheck={false}
                type="search"
                value={query}
              />
              <div
                aria-label="Show"
                className="-mx-4 flex gap-2 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none]"
                role="group"
              >
                {SCOPES.map((option) => {
                  const on = scope === option.id;
                  return (
                    <button
                      aria-pressed={on}
                      className={cn(
                        "flex min-h-11 shrink-0 items-center gap-1 rounded-full border-2 px-3.5 text-sm font-bold",
                        on
                          ? "border-ink bg-ink text-surface forced-colors:outline forced-colors:outline-2"
                          : "press-flat border-[var(--line-strong)] bg-surface text-ink",
                      )}
                      key={option.id}
                      onClick={() => setScope(option.id)}
                      type="button"
                    >
                      {option.label}
                      <span className="tabular-nums opacity-70">
                        {people.filter(option.match).length}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="phone:hidden">
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
                  enterKeyHint="search"
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
                {adding && !phone && (
                  <div className="mt-4 animate-rise-in rounded-[10px] border-2 border-line bg-raised p-4">
                    <ProfileForm
                      onCancel={() => setAdding(false)}
                      onDirtyChange={setAddDirty}
                      onSaved={(saved) => void afterAdd(saved)}
                    />
                  </div>
                )}
              </Panel>
            </div>

            {loading ? (
              <div
                aria-busy="true"
                className="flex flex-col gap-2 max-md:gap-0 max-md:overflow-hidden max-md:rounded-[16px] max-md:border-2 max-md:border-line/30"
                role="status"
              >
                <span className="sr-only">Loading people…</span>
                {[0, 1, 2, 3, 4].map((row) => (
                  <div
                    aria-hidden
                    className="flex h-16 animate-pulse flex-col justify-center gap-2 rounded-[10px] border-2 border-line/30 px-3 max-md:rounded-none max-md:border-0"
                    key={row}
                  >
                    <span className="h-4 w-1/2 rounded bg-line/10" />
                    <span className="h-3 w-3/4 rounded bg-line/10" />
                  </div>
                ))}
              </div>
            ) : !shown.length ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-subtle">Nobody matches that.</p>
                {filtered && (
                  <Button
                    onClick={() => {
                      setQuery("");
                      setScope("all");
                    }}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    Clear search
                  </Button>
                )}
              </div>
            ) : null}

            <ul
              className="flex animate-fade-in flex-col gap-2 max-md:gap-0 max-md:divide-y-2 max-md:divide-line/15 max-md:overflow-hidden max-md:rounded-[16px] max-md:border-2 max-md:border-line max-md:bg-surface max-md:empty:hidden"
              key={scope}
            >
              {shown.map((entry) => (
                <li key={entry.id}>
                  {compact ? (
                    // Phones: a fixed two-line row with a chevron.
                    <button
                      className="press-flat flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left"
                      data-stack-return={entry.id}
                      onClick={() => person.open(entry.id)}
                      type="button"
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="min-w-0 truncate font-extrabold text-ink">
                            {entry.name}
                          </span>
                          <span className="shrink-0">
                            <RowChip entry={entry} />
                          </span>
                        </span>
                        <span className="truncate text-sm text-subtle">
                          {[entry.title, entry.term, entry.username]
                            .filter(Boolean)
                            .join(" · ") ||
                            entry.email ||
                            "—"}
                        </span>
                      </span>
                      <ChevronRight
                        aria-hidden
                        className="size-5 shrink-0 text-subtle"
                      />
                    </button>
                  ) : (
                    <button
                      className="w-full rounded-[10px] border-2 border-line bg-surface px-3 py-2.5 text-left hover:bg-tint"
                      data-stack-return={entry.id}
                      onClick={() => person.open(entry.id)}
                      type="button"
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
                        {entry.term && <Pill>{entry.term}</Pill>}
                        {entry.isCurrentExec === false && <Pill>Past</Pill>}
                        {entry.status && entry.status !== "approved" && (
                          <Pill tone="accent">{entry.status}</Pill>
                        )}
                        {!entry.signupKey && <Pill>No account</Pill>}
                      </span>
                      {(entry.username || entry.email) && (
                        <span className="mt-1 block truncate text-sm text-subtle">
                          {entry.username && (
                            <span className="font-mono">{entry.username}</span>
                          )}
                          {entry.email
                            ? `${entry.username ? " · " : ""}${entry.email}`
                            : ""}
                        </span>
                      )}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : tab === "pending" ? (
          <div className="flex flex-col gap-5" {...panel("pending")}>
            {!pending.length && (
              <p className="text-subtle">No sign-ups are waiting.</p>
            )}
            {!!pending.length && user.identitiesEditable === false && (
              <Note>
                This environment shares the live Keycloak realm and mail server,
                so approving here rehearses the login, role and mailbox changes
                rather than writing them. The sign-up record itself is really
                updated.
              </Note>
            )}
            {pending.map((signup) => {
              const match = signup.matchedExec;
              return (
                <Panel
                  key={signup.$key}
                  note={
                    phone
                      ? undefined
                      : [signup.email, signup.phone, signup.studentId]
                          .filter(Boolean)
                          .join(" · ")
                  }
                  title={fullName(signup)}
                >
                  <div className="flex flex-col gap-3">
                    {phone && <ContactLine signup={signup} />}
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
                          . Approving enables their login, grants the executive
                          role and provisions their mailbox.
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
                        destructive
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
                      <div className={stack}>
                        <Button
                          disabled={!!busy}
                          onClick={() => void approve(signup)}
                          size="sm"
                          type="button"
                          variant="primary"
                        >
                          {busy === `${signup.$key}:approve`
                            ? "Approving..."
                            : "Approve"}
                        </Button>
                        <Button
                          disabled={!!busy}
                          onClick={() => setRejecting(signup)}
                          size="sm"
                          type="button"
                          variant={
                            phone ? "outline-destructive" : "destructive"
                          }
                        >
                          Reject...
                        </Button>
                      </div>
                    )}
                  </div>
                </Panel>
              );
            })}
          </div>
        ) : tab === "limits" ? (
          <div className="flex flex-col gap-5" {...panel("limits")}>
            {!limitRequests.length && (
              <p className="text-subtle">No one is asking to send more mail.</p>
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
                      <div className={stack}>
                        <Button
                          disabled={!!busy}
                          onClick={() => void reviewLimit(signup, "approve")}
                          size="sm"
                          type="button"
                          variant="primary"
                        >
                          {busy === `limit:${signup.$key}:approve`
                            ? "Approving..."
                            : "Approve"}
                        </Button>
                        <Button
                          disabled={!!busy}
                          onClick={() => void reviewLimit(signup, "decline")}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          {busy === `limit:${signup.$key}:decline`
                            ? "Declining..."
                            : "Decline"}
                        </Button>
                      </div>
                    )}
                  </div>
                </Panel>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-5" {...panel("deletions")}>
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
                    <div className={stack}>
                      <Button
                        disabled={!!busy}
                        onClick={() => void destroyMessage(signup, request)}
                        size="sm"
                        type="button"
                        variant="outline-destructive"
                      >
                        {busy === `deletion:${request.id}:approve`
                          ? "Destroying..."
                          : "Destroy message"}
                      </Button>
                      <Button
                        disabled={!!busy}
                        onClick={() =>
                          void reviewDeletion(signup, request.id, "decline")
                        }
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        {busy === `deletion:${request.id}:decline`
                          ? "Declining..."
                          : "Decline"}
                      </Button>
                    </div>
                  )}
                </div>
              </Panel>
            ))}
          </div>
        )}
      </div>

      {/* Below desk the create action is a FAB, like Events and Documents. */}
      <Fab
        extended
        hidden={tab !== "directory" || selected != null || adding}
        icon={UserPlus}
        label="Add a tile"
        onPress={() => setAdding(true)}
      />

      {/* Phones: adding a tile is its own full screen, Create in the top
          bar. Desk keeps the inline form in "Find someone". */}
      {phone && (
        <Sheet
          dismissible={!addSaving}
          onClose={(reason) => void closeAdd(reason)}
          open={adding}
          presentation="full"
          title="Add a tile"
          topBar={{
            leading: (
              <button
                className="press-flat min-h-11 rounded-[10px] px-3 font-bold text-ink"
                onClick={() => void closeAdd("close-button")}
                type="button"
              >
                Cancel
              </button>
            ),
            trailing: (
              <button
                className="press min-h-11 min-w-11 rounded-[16px] border-2 border-line bg-brand px-4 font-bold text-brand-ink shadow-brut-sm disabled:opacity-60 forced-colors:border-[ButtonText]"
                disabled={addSaving}
                form="add-tile-form"
                type="submit"
              >
                {addSaving ? "Creating…" : "Create"}
              </button>
            ),
          }}
        >
          <div className="pt-4 pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]">
            <ProfileForm
              formId="add-tile-form"
              onDirtyChange={setAddDirty}
              onSaved={(saved) => void afterAdd(saved)}
              onSavingChange={setAddSaving}
            />
          </div>
        </Sheet>
      )}
    </AdminPage>
  );
}
