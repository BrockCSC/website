"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSession } from "../../session";
import { Note, Pill } from "../../users/ui";
import {
  errorText,
  fetchAliases,
  setCatchAll,
  syncAliases,
  type Alias,
  type AliasDirectory,
} from "./api";
import { DeliversTo } from "./chips";
import AliasEditor from "./editor";

const EXAMPLES = ["events", "sponsorship"];

const Tile = ({
  label,
  value,
  detail,
  children,
}: {
  label: string;
  value: string;
  detail: string;
  children?: React.ReactNode;
}) => (
  <div className="animate-rise-in rounded-[20px] border-2 border-line bg-surface p-4 shadow-brut-sm">
    <div className="text-xs font-bold uppercase tracking-wide text-subtle">
      {label}
    </div>
    <div className="mt-1 truncate text-2xl font-extrabold text-brand">
      {value}
    </div>
    <div className="mt-1 text-sm text-subtle">{detail}</div>
    {children}
  </div>
);

export default function AliasesPage() {
  const { user } = useSession();
  const [directory, setDirectory] = useState<AliasDirectory | null>(null);
  const [editing, setEditing] = useState<{
    alias: Alias | null;
    name?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [catchAllBusy, setCatchAllBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDirectory(await fetchAliases());
      setError(null);
    } catch {
      setError("Could not load aliases right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const sync = async () => {
    setSyncing(true);
    setNotice(null);
    setError(null);
    try {
      const result = await syncAliases();
      await load();
      setNotice(
        result.rehearsed
          ? "Rehearsed — nothing was written."
          : "Routing is in sync.",
      );
    } catch (err) {
      setError(errorText(err, "Could not re-sync right now."));
    } finally {
      setSyncing(false);
    }
  };

  const changeCatchAll = async (address: string) => {
    setCatchAllBusy(true);
    setNotice(null);
    setError(null);
    try {
      const result = await setCatchAll(address || null);
      await load();
      setNotice(
        result.rehearsed
          ? "Rehearsed — nothing was written."
          : address
            ? `Unaddressed mail now goes to ${address}.`
            : "Unaddressed mail now bounces.",
      );
    } catch (err) {
      setError(errorText(err, "Could not change the catch-all right now."));
    } finally {
      setCatchAllBusy(false);
    }
  };

  if (!user?.isMailAdmin) {
    return (
      <div className="mx-auto w-full max-w-[1060px] px-5 py-8">
        <Note>Only a mail admin can manage aliases.</Note>
      </div>
    );
  }

  const synced = directory?.aliases.find((alias) => alias.synced);
  const forwardTo = synced?.name ?? "co-presidents";

  return (
    <div className="mx-auto flex w-full max-w-[1060px] flex-col gap-5 px-5 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Aliases</h1>
          <p className="mt-1 text-subtle">
            Mail sent to a shared address fans out to everyone behind it. Drop a
            whole group into an alias and its people inherit it.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            disabled={syncing || !directory}
            onClick={sync}
            size="sm"
            type="button"
            variant="secondary"
          >
            {syncing ? "Syncing…" : "Re-sync"}
          </Button>
          {!editing && (
            <Button
              disabled={!directory}
              onClick={() => setEditing({ alias: null })}
              size="sm"
              type="button"
            >
              New alias
            </Button>
          )}
        </div>
      </div>

      {directory && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Tile
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
              className="mt-3 w-full rounded-[10px] border-2 border-line bg-raised px-2 py-1.5 text-sm font-semibold text-ink outline-none focus:border-brand disabled:opacity-50"
              disabled={catchAllBusy}
              onChange={(event) => void changeCatchAll(event.target.value)}
              value={directory.catchAll ?? ""}
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
          </Tile>
          <Tile
            detail={
              directory.forwarding.length
                ? `${directory.forwarding.map((f) => f.name).join(", ")} → ${forwardTo}`
                : `Read-only inboxes forward to ${forwardTo}`
            }
            label="Forwarding"
            value={`${directory.forwarding.length} read-only`}
          />
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
      {notice && <Note>{notice}</Note>}
      {loading && <p className="text-subtle">Loading...</p>}

      {directory && editing ? (
        <AliasEditor
          alias={editing.alias}
          directory={directory}
          initialName={editing.name}
          key={editing.alias?.id ?? editing.name ?? "new"}
          onClose={() => setEditing(null)}
          onSaved={async (next) => {
            await load();
            setEditing(null);
            setNotice(next);
          }}
        />
      ) : (
        directory && (
          <div className="grid gap-5 sm:grid-cols-2">
            {directory.aliases.map((alias, index) => (
              <button
                className="flex animate-rise-in flex-col items-start gap-3 rounded-[20px] border-2 border-line bg-surface p-5 text-left shadow-brut hover:-translate-y-0.5 hover:bg-tint motion-reduce:hover:translate-y-0"
                key={alias.id}
                onClick={() => {
                  setNotice(null);
                  setEditing({ alias });
                }}
                style={{ animationDelay: `${index * 20}ms` }}
                type="button"
              >
                <span className="flex w-full flex-wrap items-center justify-between gap-2">
                  <span className="break-all font-mono text-lg font-extrabold text-brand">
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
                  <span className="text-sm text-ink">{alias.description}</span>
                )}
                <span className="text-xs font-bold uppercase tracking-wide text-subtle">
                  Delivers to
                </span>
                <DeliversTo alias={alias} directory={directory} />
              </button>
            ))}
            {!directory.aliases.length && (
              <div className="animate-rise-in rounded-[20px] border-2 border-line bg-tint p-5 shadow-brut-sm">
                <p className="text-lg font-extrabold text-ink">
                  No shared addresses yet
                </p>
                <p className="mt-1 text-sm text-subtle">
                  Start with one people already write to.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    onClick={() => setEditing({ alias: null })}
                    size="sm"
                    type="button"
                  >
                    Create an alias
                  </Button>
                  {EXAMPLES.map((name) => (
                    <Button
                      key={name}
                      onClick={() => setEditing({ alias: null, name })}
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
        )
      )}
    </div>
  );
}
