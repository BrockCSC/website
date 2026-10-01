"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { ListGroup } from "@/components/ui/list-group";
import { toast } from "@/components/ui/toast";
import { BELOW_LG, useMediaQuery, usePhone } from "@/lib/use-media-query";
import { useStackParam } from "@/lib/use-stack-param";
import { AdminPage } from "../../page-frame";
import { useSession } from "../../session";
import { Note, Pill } from "../../users/ui";
import {
  createAlias,
  errorText,
  fetchAliases,
  setCatchAll,
  syncAliases,
  type Alias,
  type AliasDirectory,
} from "./api";
import { DeliversTo, aliasMeta } from "./chips";
import { aliasDraftKey } from "./draft";
import AliasEditor, { type EditorStatus } from "./editor";

const BELOW_SM = "(max-width: 639.98px)";
const EXAMPLES = ["events", "sponsorship"];
const CATCH_ALL_NAME = "catch-all";
const REHEARSED = "Rehearsed — nothing was written.";

/** Run once no <dialog> is open (or ~1.5s passed), so a toast isn't under the top layer. */
const afterDialogs = (fn: () => void) => {
  let tries = 0;
  const tick = () => {
    if (!document.querySelector("dialog[open]") || ++tries > 90) fn();
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const visibleAlias = (name: string) =>
  Array.from(
    document.querySelectorAll<HTMLElement>(
      `[data-alias="${CSS.escape(name)}"]`,
    ),
  ).find((el) => el.getClientRects().length > 0) ?? null;

/** Bring the alias's row or card into view and flash it. */
const flashAlias = (name: string) => {
  const el = visibleAlias(name);
  if (!el) return;
  el.scrollIntoView({ block: "center" });
  el.focus({ preventScroll: true });
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.style.transition = reduced ? "" : "background-color 200ms ease";
  el.style.backgroundColor = "var(--color-tint)";
  setTimeout(() => {
    el.style.backgroundColor = "";
  }, 600);
};

const Tile = ({
  label,
  value,
  detail,
  className = "",
  children,
}: {
  label: string;
  value: string;
  detail: string;
  className?: string;
  children?: React.ReactNode;
}) => (
  <div
    className={`min-w-0 animate-rise-in rounded-[16px] border-2 border-line bg-surface p-3.5 shadow-brut-sm transition-shadow duration-[var(--dur)] ease-smooth hover:shadow-[3px_3px_0_0_var(--brand)] max-sm:shadow-none ${className}`}
  >
    <div className="text-xs font-bold uppercase tracking-wide text-subtle">
      {label}
    </div>
    <div className="mt-1 truncate text-2xl font-extrabold text-brand max-sm:text-lg max-sm:whitespace-normal max-sm:wrap-anywhere">
      {value}
    </div>
    <div className="mt-1 text-sm text-subtle">{detail}</div>
    {children}
  </div>
);

type Target = {
  /** Stable per screen: `edit:<name>` or `new:<prefill>`. */
  id: string;
  alias: Alias | null;
  initialName: string;
  draftKey: string;
};

export default function AliasesPage() {
  return (
    <Suspense fallback={null}>
      <Aliases />
    </Suspense>
  );
}

function Aliases() {
  const { user } = useSession();
  const phone = usePhone();
  const rows = useMediaQuery(BELOW_SM);
  const [directory, setDirectory] = useState<AliasDirectory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [catchAllBusy, setCatchAllBusy] = useState(false);
  // A catch-all choice waiting for Apply (settings-17).
  const [catchAllChoice, setCatchAllChoice] = useState<string | null>(null);

  // The editor is a stack screen (spec D4): ?edit=<name> or ?new=1|<name>.
  const statusRef = useRef<EditorStatus>({ dirty: false });
  const keepRef = useRef<(reopen: () => void) => void>(() => {});
  const reopenRef = useRef<(kind: "edit" | "new", value: string) => void>(
    () => {},
  );
  const edit = useStackParam("edit", {
    push: BELOW_LG,
    onUserPop: (prev) => keepRef.current(() => reopenRef.current("edit", prev)),
  });
  const newP = useStackParam("new", {
    push: BELOW_LG,
    onUserPop: (prev) => keepRef.current(() => reopenRef.current("new", prev)),
  });

  const load = useCallback(async () => {
    try {
      const next = await fetchAliases();
      setDirectory(next);
      setError(null);
      return next;
    } catch {
      setError("Could not load aliases right now.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const say = (message: string) => {
    setNotice(message);
    toast({ message });
  };

  const fail = (message: string) => {
    setError(message);
    toast({ tone: "error", message });
  };

  const openEdit = (name: string) => {
    setNotice(null);
    edit.open(name);
  };
  const openNew = (prefill?: string) => {
    setNotice(null);
    newP.open(prefill || "1");
  };

  const closeEditor = () => {
    if (edit.value != null) edit.close();
    else newP.close();
  };

  const keepAliasDraft = (reopen: () => void) => {
    if (!statusRef.current.dirty) return;
    afterDialogs(() =>
      toast({
        message: "Unsaved changes kept",
        action: { label: "Reopen", onAction: reopen },
      }),
    );
  };
  useLayoutEffect(() => {
    keepRef.current = keepAliasDraft;
    reopenRef.current = (kind, value) =>
      kind === "edit" ? openEdit(value) : openNew(value);
  });

  // Resolve the open screen against the loaded directory.
  const editName = edit.value;
  const editAlias =
    editName != null
      ? (directory?.aliases.find((alias) => alias.name === editName) ?? null)
      : null;
  const target: Target | null =
    directory == null
      ? null
      : editName != null
        ? editAlias && {
            id: `edit:${editAlias.id}`,
            alias: editAlias,
            initialName: editAlias.name,
            draftKey: aliasDraftKey(editAlias.name),
          }
        : newP.value != null
          ? {
              id: `new:${newP.value}`,
              alias: null,
              initialName: newP.value === "1" ? "" : newP.value,
              draftKey: aliasDraftKey(null),
            }
          : null;

  // ?edit= for an alias that doesn't exist (renamed, deleted, a stale link).
  const missing = directory != null && editName != null && !editAlias;
  useEffect(() => {
    if (missing) edit.close();
  }, [missing, edit]);

  // The editor that is showing, kept through the phone sheet's exit
  // animation after the screen closes.
  const [shown, setShown] = useState<Target | null>(null);
  if (target && target.id !== shown?.id) setShown(target);
  if (!target && shown && !phone) setShown(null);

  const sync = async () => {
    setSyncing(true);
    setNotice(null);
    setError(null);
    try {
      const result = await syncAliases();
      await load();
      say(result.rehearsed ? REHEARSED : "Routing is in sync.");
    } catch (err) {
      fail(errorText(err, "Could not re-sync right now."));
    } finally {
      setSyncing(false);
    }
  };

  const changeCatchAll = async (address: string, previous: string) => {
    setCatchAllBusy(true);
    setNotice(null);
    setError(null);
    try {
      const result = await setCatchAll(address || null);
      await load();
      setCatchAllChoice(null);
      const message = result.rehearsed
        ? REHEARSED
        : address
          ? `Unaddressed mail now goes to ${address}.`
          : "Unaddressed mail now bounces.";
      setNotice(message);
      toast({
        message,
        action: result.rehearsed
          ? undefined
          : {
              label: "Undo",
              onAction: () => void changeCatchAll(previous, address),
            },
      });
    } catch (err) {
      fail(errorText(err, "Could not change the catch-all right now."));
    } finally {
      setCatchAllBusy(false);
    }
  };

  /** Unaddressed mail can only reach one address, so a list stands behind it. */
  const startCatchAllList = async () => {
    setCatchAllBusy(true);
    setNotice(null);
    setError(null);
    try {
      const existing = directory?.aliases.find(
        (alias) => alias.name === CATCH_ALL_NAME,
      );
      const address =
        existing?.address ?? `${CATCH_ALL_NAME}@${directory?.domain}`;
      if (!existing) {
        await createAlias({
          name: CATCH_ALL_NAME,
          description: "Mail sent to an address that does not exist.",
          aliases: [],
          recipients: {
            people: [],
            groups: synced ? [synced.address] : [],
            external: [],
            roles: [],
          },
        });
      }
      const result = await setCatchAll(address);
      const next = await load();
      say(
        result.rehearsed
          ? REHEARSED
          : `Unaddressed mail now goes to ${address}. Add whoever should read it.`,
      );
      const made = next?.aliases.find((alias) => alias.name === CATCH_ALL_NAME);
      if (made) openEdit(made.name);
    } catch (err) {
      fail(errorText(err, "Could not set up a catch-all list right now."));
    } finally {
      setCatchAllBusy(false);
    }
  };

  if (!user?.isMailAdmin) {
    return (
      <AdminPage>
        <Note>Only a mail admin can manage aliases.</Note>
      </AdminPage>
    );
  }

  const synced = directory?.aliases.find((alias) => alias.synced);
  const forwardTo = synced?.name ?? "co-presidents";
  const readOnly = directory?.people.filter((person) => person.readOnly) ?? [];
  const catchAllAlias = directory?.aliases.find(
    (alias) =>
      alias.address === directory.catchAll ||
      alias.aliases.includes(directory.catchAll ?? ""),
  );
  const editing = target != null;
  const inlineEditing = editing && !phone;
  const catchAllCurrent = directory?.catchAll ?? "";
  const catchAllValue = catchAllChoice ?? catchAllCurrent;

  const editor = shown && directory && (
    <AliasEditor
      alias={shown.alias}
      directory={directory}
      draftKey={shown.draftKey}
      initialName={shown.initialName}
      key={shown.id}
      onDiscard={() => {
        const name = shown.alias?.name;
        closeEditor();
        if (!phone && name) afterDialogs(() => flashAlias(name));
      }}
      onExited={() => {
        if (!target) setShown(null);
      }}
      onKeep={() => {
        const reopenKind = edit.value != null ? "edit" : "new";
        const reopenValue = edit.value ?? newP.value ?? "1";
        closeEditor();
        keepAliasDraft(() => reopenRef.current(reopenKind, reopenValue));
      }}
      onSaved={(message, name) => {
        closeEditor();
        setNotice(message);
        void load().then(() =>
          afterDialogs(() => {
            toast({ message });
            if (name) flashAlias(name);
          }),
        );
      }}
      open={target != null}
      phone={phone}
      statusRef={statusRef}
    />
  );

  const intro = (
    <>
      Mail sent to a shared address fans out to everyone behind it. Drop a whole
      group into an alias and its people inherit it. Checking routing rebuilds
      what follows the co-president role: who is on admin@ and {forwardTo}@, and
      which read-only inboxes forward there.
    </>
  );

  return (
    <AdminPage className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-ink">Aliases</h1>
          <p className="mt-1 max-w-prose text-subtle max-sm:hidden">{intro}</p>
          <div className="mt-1 sm:hidden">
            <p className="text-subtle">
              Shared addresses that fan out to everyone behind them.
            </p>
            <details className="group mt-1">
              <summary className="press-flat -mx-2 flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-[10px] px-2 text-sm font-bold text-ink [&::-webkit-details-marker]:hidden">
                How routing works
                <ChevronDown
                  aria-hidden
                  className="size-4 transition-transform duration-[var(--dur-fast)] group-open:rotate-180"
                />
              </summary>
              <p className="pb-1 text-sm text-subtle">{intro}</p>
            </details>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            disabled={syncing || !directory}
            onClick={sync}
            size="sm"
            type="button"
            variant="secondary"
          >
            {syncing ? "Checking…" : "Check routing"}
          </Button>
          <Button
            disabled={!directory || editing}
            onClick={() => openNew()}
            size="sm"
            type="button"
          >
            New alias
          </Button>
        </div>
      </div>

      {directory && (
        <div className="grid gap-4 max-sm:order-last sm:grid-cols-3">
          <Tile
            className="max-sm:hidden"
            detail="Shared addresses on the domain"
            label="Aliases"
            value={String(directory.aliases.length)}
          />
          <Tile
            detail={
              directory.catchAll
                ? `Unaddressed mail lands at ${directory.catchAll}`
                : "Unaddressed mail bounces back to the sender"
            }
            label="Catch-all"
            value={directory.catchAll ? `→ ${directory.catchAll}` : "Off"}
          >
            <select
              aria-label="Where unaddressed mail goes"
              className="mt-3 w-full rounded-[10px] border-2 border-line bg-raised px-2 py-1.5 text-base font-semibold text-ink outline-none focus:border-brand disabled:opacity-50 pointer-fine:text-sm pointer-coarse:min-h-11"
              disabled={catchAllBusy}
              onChange={(event) => {
                const next = event.target.value;
                setCatchAllChoice(next === catchAllCurrent ? null : next);
              }}
              value={catchAllValue}
            >
              <option value="">Bounce it (off)</option>
              {directory.aliases.map((one) => (
                <option key={one.id} value={one.address}>
                  {one.name} — everyone on the alias
                </option>
              ))}
              {directory.people.map((person) => (
                <option key={person.address} value={person.address}>
                  {person.name} — {person.address}
                </option>
              ))}
            </select>
            {catchAllChoice != null && (
              <div className="mt-2 flex gap-2">
                <Button
                  className="flex-1"
                  disabled={catchAllBusy}
                  onClick={() =>
                    void changeCatchAll(catchAllChoice, catchAllCurrent)
                  }
                  size="sm"
                  type="button"
                >
                  {catchAllBusy ? "Applying…" : "Apply"}
                </Button>
                <Button
                  className="flex-1"
                  disabled={catchAllBusy}
                  onClick={() => setCatchAllChoice(null)}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  Cancel
                </Button>
              </div>
            )}
            {catchAllAlias ? (
              <Button
                className="mt-2 w-full"
                onClick={() => openEdit(catchAllAlias.name)}
                size="sm"
                type="button"
                variant="secondary"
              >
                Edit who is on {catchAllAlias.name}
              </Button>
            ) : (
              <Button
                className="mt-2 w-full"
                disabled={catchAllBusy}
                onClick={() => void startCatchAllList()}
                size="sm"
                type="button"
                variant="secondary"
              >
                {catchAllBusy ? "Working…" : "Share it with a list"}
              </Button>
            )}
          </Tile>
          <Tile
            detail={
              readOnly.length === 0
                ? "No past executive holds a read-only mailbox."
                : `Every one of them is copied to ${forwardTo}@${directory.domain}.`
            }
            label="Read-only inboxes forwarding"
            value={`${directory.forwarding.length} of ${readOnly.length}`}
          >
            {readOnly.length > 0 && (
              <ul className="mt-3 flex max-h-40 flex-col gap-1 overflow-y-auto max-sm:max-h-none max-sm:overflow-visible">
                {readOnly.map((person) => {
                  const on = directory.forwarding.some(
                    (one) => one.address === person.address,
                  );
                  return (
                    <li
                      className="flex items-baseline justify-between gap-2 text-sm"
                      key={person.address}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-bold text-ink">
                          {person.name}
                        </span>
                        <span className="block truncate text-xs text-subtle">
                          {person.address}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 text-[10px] font-extrabold tracking-wide uppercase max-sm:text-xs ${on ? "text-subtle" : "text-brand"}`}
                      >
                        {on ? "forwarding" : "not yet"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {readOnly.length > directory.forwarding.length && (
              <Button
                className="mt-3 w-full"
                disabled={syncing}
                onClick={sync}
                size="sm"
                type="button"
                variant="secondary"
              >
                {syncing ? "Checking…" : "Set up the rest"}
              </Button>
            )}
          </Tile>
        </div>
      )}

      {directory && !directory.identitiesEditable && (
        <Note>
          This environment shares the live mail server, so changes here are
          rehearsed, not written: you see exactly what would happen, and nothing
          reaches a real address.
        </Note>
      )}
      {error && <Note>{error}</Note>}
      {notice && (
        <div className="phone:hidden">
          <Note>{notice}</Note>
        </div>
      )}
      {loading && <p className="text-subtle">Loading...</p>}

      {inlineEditing
        ? editor
        : directory && (
            <>
              {phone && editor}
              {/* Below sm: one grouped list of dense rows (only one of the
                  two layouts is in the DOM, so each address appears once). */}
              {rows && directory.aliases.length > 0 && (
                <ListGroup
                  header={`${directory.aliases.length} ${directory.aliases.length === 1 ? "alias" : "aliases"}`}
                >
                  {directory.aliases.map((alias) => (
                    <li key={alias.id}>
                      <button
                        className="press-flat flex min-h-13 w-full items-center gap-3 px-4 py-3 text-left"
                        data-alias={alias.name}
                        data-stack-return={alias.name}
                        onClick={() => openEdit(alias.name)}
                        type="button"
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate font-mono font-extrabold text-ink">
                            {alias.address}
                          </span>
                          {alias.description && (
                            <span className="line-clamp-2 text-sm text-ink">
                              {alias.description}
                            </span>
                          )}
                          <span className="truncate text-sm text-subtle">
                            {aliasMeta(alias)}
                          </span>
                        </span>
                        <ChevronRight
                          aria-hidden
                          className="size-5 shrink-0 text-subtle"
                        />
                      </button>
                    </li>
                  ))}
                </ListGroup>
              )}
              {!(rows && directory.aliases.length > 0) && (
                <div className="grid gap-5 sm:grid-cols-2">
                  {directory.aliases.map((alias, index) => (
                    <button
                      className="flex animate-rise-in flex-col items-start gap-3 rounded-[20px] border-2 border-line bg-surface p-5 text-left shadow-brut hover:-translate-y-0.5 hover:bg-tint hover:shadow-[6px_8px_0_0_var(--shade)] motion-reduce:hover:translate-y-0"
                      data-alias={alias.name}
                      data-stack-return={alias.name}
                      key={alias.id}
                      onClick={() => openEdit(alias.name)}
                      style={{ animationDelay: `${index * 20}ms` }}
                      type="button"
                    >
                      <span className="flex w-full flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-lg font-extrabold wrap-anywhere text-brand">
                          {alias.address}
                        </span>
                        {alias.synced && (
                          <Pill tone="accent">Synced with Keycloak</Pill>
                        )}
                      </span>
                      {alias.aliases.length > 0 && (
                        <span className="text-sm text-subtle">
                          also{" "}
                          {alias.aliases
                            .map((one) => `${one}@${directory.domain}`)
                            .join(", ")}
                        </span>
                      )}
                      {alias.description && (
                        <span className="text-sm text-ink">
                          {alias.description}
                        </span>
                      )}
                      <span className="text-xs font-bold uppercase tracking-wide text-subtle">
                        Delivers to
                      </span>
                      <DeliversTo alias={alias} directory={directory} />
                    </button>
                  ))}
                  {!directory.aliases.length && (
                    <div className="animate-rise-in rounded-[20px] border-2 border-line bg-tint p-5 shadow-brut-sm max-sm:shadow-none">
                      <p className="text-lg font-extrabold text-ink">
                        No shared addresses yet
                      </p>
                      <p className="mt-1 text-sm text-subtle">
                        Start with one people already write to.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          onClick={() => openNew()}
                          size="sm"
                          type="button"
                        >
                          Create an alias
                        </Button>
                        {EXAMPLES.map((name) => (
                          <Button
                            key={name}
                            onClick={() => openNew(name)}
                            size="sm"
                            type="button"
                            variant="secondary"
                          >
                            {name}@{directory.domain}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
    </AdminPage>
  );
}
