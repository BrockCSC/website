"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ask } from "../../ask";
import { Label, Note, Panel, field } from "../../users/ui";
import { RecipientInput } from "../recipient-input";
import {
  createAlias,
  deleteAlias,
  errorText,
  updateAlias,
  type Alias,
  type AliasDirectory,
  type Delivered,
  type Recipients,
} from "./api";
import { DeliveredRows, groupOf } from "./chips";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REHEARSED = "Rehearsed — nothing was written.";

const resolve = (
  recipients: Recipients,
  directory: AliasDirectory,
  selfId: string,
): Delivered[] => {
  const names = new Map(directory.people.map((p) => [p.address, p.name]));
  const out = new Map<string, Delivered>();
  const walk = (list: Recipients, via: string[], seen: Set<string>) => {
    for (const address of [...list.people, ...list.external]) {
      const entry = out.get(address) ?? {
        address,
        name: names.get(address) ?? null,
        via: [],
        direct: false,
      };
      if (via.length === 0) entry.direct = true;
      else if (entry.via.length === 0) entry.via = via;
      out.set(address, entry);
    }
    for (const address of list.groups) {
      const group = groupOf(directory, address);
      if (group && !seen.has(group.id)) {
        walk(group.recipients, [...via, address], new Set([...seen, group.id]));
      }
    }
  };
  walk(recipients, [], new Set([selfId]));
  return [...out.values()];
};

export default function AliasEditor({
  directory,
  alias,
  initialName = "",
  onClose,
  onSaved,
}: {
  directory: AliasDirectory;
  alias: Alias | null;
  initialName?: string;
  onClose: () => void;
  onSaved: (notice: string) => Promise<void>;
}) {
  const [name, setName] = useState(alias?.name ?? initialName);
  const [description, setDescription] = useState(alias?.description ?? "");
  const [extras, setExtras] = useState<string[]>(alias?.aliases ?? []);
  const [people, setPeople] = useState(alias?.recipients.people ?? []);
  const [groups, setGroups] = useState(alias?.recipients.groups ?? []);
  const [external, setExternal] = useState(alias?.recipients.external ?? []);
  const [roles, setRoles] = useState<string[]>(alias?.recipients.roles ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);

  const recipients = { people, groups, external, roles };
  const delivered = alias?.synced
    ? alias.delivered
    : resolve(recipients, directory, alias?.id ?? "new");

  const run = async (kind: "save" | "delete", work: () => Promise<string>) => {
    setBusy(kind);
    setError(null);
    try {
      await onSaved(await work());
    } catch (err) {
      setError(errorText(err, `Could not ${kind} this alias.`));
    } finally {
      setBusy(null);
    }
  };

  const save = () => {
    const bad = external.find((address) => !EMAIL.test(address));
    if (bad) return setError(`"${bad}" is not an email address.`);
    const aliases = extras.map((one) => one.replace(/@.*$/, ""));
    void run("save", async () => {
      const saved = alias
        ? await updateAlias(
            alias.name,
            alias.synced
              ? { description, aliases }
              : { description, aliases, recipients },
          )
        : await createAlias({ name, description, aliases, recipients });
      return "rehearsed" in saved ? REHEARSED : `Saved ${saved.address}.`;
    });
  };

  const remove = async () => {
    if (!alias) return;
    const ok = await ask({
      title: `Delete ${alias.address}?`,
      detail: "Mail sent there will bounce from now on.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (ok === null) return;
    void run("delete", async () =>
      (await deleteAlias(alias.name))?.rehearsed
        ? REHEARSED
        : `Deleted ${alias.address}.`,
    );
  };

  const ready =
    Boolean(name) &&
    (alias?.synced || people.length + groups.length + external.length > 0);

  return (
    <Panel
      action={
        <Button
          disabled={busy !== null}
          onClick={onClose}
          size="sm"
          type="button"
          variant="secondary"
        >
          Cancel
        </Button>
      }
      note={
        alias?.synced
          ? "Its members follow the co-president role in Keycloak."
          : "Mail to this address is copied to everyone below."
      }
      title={alias ? alias.address : "New alias"}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready && !busy) save();
        }}
      >
        <div>
          <Label htmlFor="alias-name">Name</Label>
          <div className="flex items-center gap-2">
            <input
              className={field}
              disabled={!!alias}
              id="alias-name"
              onChange={(e) => setName(e.target.value.trim().toLowerCase())}
              placeholder="events"
              value={name}
            />
            <span className="shrink-0 text-sm font-semibold text-subtle">
              @{directory.domain}
            </span>
          </div>
        </div>
        <div>
          <Label htmlFor="alias-description">Description</Label>
          <input
            className={field}
            id="alias-description"
            maxLength={200}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Who this is for"
            value={description}
          />
        </div>
        <RecipientInput
          contacts={[]}
          label="Also"
          onChange={setExtras}
          placeholder="another local part, like team"
          value={extras}
        />

        {alias?.synced ? (
          <Note>
            Membership comes from the co-president role in Keycloak. Grant or
            remove that role in Users, then re-sync.
          </Note>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-bold text-ink">Delivers to</span>
            <div className="rounded-[10px] border-2 border-line px-2 py-1.5">
              <span className="px-1 text-sm font-bold text-subtle">Roles</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {directory.roleGroups.map((group) => {
                  const on = roles.includes(group.id);
                  const covers = directory.roleMembers[group.id]?.length ?? 0;
                  return (
                    <button
                      aria-pressed={on}
                      className={`rounded-full border-2 border-line px-2.5 py-0.5 text-sm font-semibold ${
                        on
                          ? "bg-brand text-brand-ink"
                          : "bg-surface text-ink hover:bg-tint"
                      }`}
                      key={group.id}
                      onClick={() =>
                        setRoles(
                          on
                            ? roles.filter((one) => one !== group.id)
                            : [...roles, group.id],
                        )
                      }
                      title={group.detail}
                      type="button"
                    >
                      {group.label}
                      <span
                        className={on ? "opacity-80" : "text-subtle"}
                      >{` ${covers}`}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 px-1 text-xs text-subtle">
                A role keeps itself current: whoever holds it when mail arrives
                is who receives it.
              </p>
            </div>
            <RecipientInput
              browse
              contacts={directory.people.map((p) => ({
                name: p.name,
                email: p.address,
              }))}
              empty="Everyone with a mailbox is already on this alias."
              label="People"
              onChange={setPeople}
              placeholder="Click to pick from the club"
              value={people}
            />
            <RecipientInput
              browse
              contacts={directory.aliases
                .filter((one) => one.id !== alias?.id)
                .map((one) => ({ name: one.name, email: one.address }))}
              empty="No other alias to nest yet."
              label="Groups"
              onChange={setGroups}
              placeholder="Click to pick another alias"
              value={groups}
            />
            <RecipientInput
              contacts={[]}
              label="External"
              onChange={setExternal}
              placeholder="anyone@elsewhere.com"
              value={external}
            />
          </div>
        )}

        <div>
          <span className="mb-1 block text-sm font-bold text-ink">
            Who actually gets it
          </span>
          <DeliveredRows delivered={delivered} />
        </div>

        {error && <Note>{error}</Note>}

        <div className="flex flex-wrap gap-2">
          <Button disabled={!ready || busy !== null} type="submit">
            {busy === "save" ? "Saving…" : "Save"}
          </Button>
          {alias && !alias.synced && (
            <Button
              disabled={busy !== null}
              onClick={remove}
              type="button"
              variant="destructive"
            >
              {busy === "delete" ? "Deleting…" : "Delete"}
            </Button>
          )}
        </div>
      </form>
    </Panel>
  );
}
