"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ListGroup, ListRow } from "@/components/ui/list-group";
import { Sheet, type SheetCloseReason } from "@/components/ui/sheet";
import { announce } from "@/lib/announce";
import { COARSE_QUERY, mediaMatches } from "@/lib/use-media-query";
import { ask, isAskOpen } from "../../ask";
import { Label, Note, Panel, field } from "../../users/ui";
import { RecipientInput, type RecipientInputHandle } from "../recipient-input";
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
import { DeliveredRows, groupOf, peopleCount } from "./chips";
import {
  clearAliasDraft,
  loadAliasDraft,
  sameDraft,
  sameRecipients,
  saveAliasDraft,
  type AliasDraft,
} from "./draft";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REHEARSED = "Rehearsed — nothing was written.";

/**
 * Who a draft reaches: people and external addresses directly, nested groups
 * through what the server says each group delivers to, and roles through the
 * addresses each role covers today.
 */
const resolve = (
  recipients: Recipients,
  directory: AliasDirectory,
): Delivered[] => {
  const names = new Map(directory.people.map((p) => [p.address, p.name]));
  const labels = new Map(directory.roleGroups.map((g) => [g.id, g.label]));
  const out = new Map<string, Delivered>();
  const add = (address: string, via: string[], name?: string | null) => {
    const entry = out.get(address) ?? {
      address,
      name: name ?? names.get(address) ?? null,
      via: [],
      direct: false,
    };
    if (via.length === 0) entry.direct = true;
    else entry.via = [...new Set([...entry.via, ...via])];
    out.set(address, entry);
  };
  for (const address of [...recipients.people, ...recipients.external]) {
    add(address, []);
  }
  for (const address of recipients.groups) {
    for (const entry of groupOf(directory, address)?.delivered ?? []) {
      add(entry.address, [address], entry.name);
    }
  }
  for (const role of recipients.roles) {
    for (const address of directory.roleMembers[role] ?? []) {
      add(address, [labels.get(role) ?? role]);
    }
  }
  return [...out.values()];
};

const initialDraft = (
  alias: Alias | null,
  initialName: string,
): AliasDraft => ({
  name: alias?.name ?? initialName,
  description: alias?.description ?? "",
  extras: alias?.aliases ?? [],
  recipients: {
    people: alias?.recipients.people ?? [],
    groups: alias?.recipients.groups ?? [],
    external: alias?.recipients.external ?? [],
    roles: alias?.recipients.roles ?? [],
  },
});

export type EditorStatus = { dirty: boolean };

export default function AliasEditor({
  directory,
  alias,
  initialName = "",
  draftKey,
  phone,
  open,
  statusRef,
  onSaved,
  onDiscard,
  onKeep,
  onExited,
}: {
  directory: AliasDirectory;
  alias: Alias | null;
  initialName?: string;
  /** sessionStorage key for the unsaved form (draft.ts). */
  draftKey: string;
  /** Full-screen sheet on phones, the inline panel on desk. */
  phone: boolean;
  open: boolean;
  /** Written on every commit, so the page can tell whether a back kept edits. */
  statusRef: React.RefObject<EditorStatus>;
  /** Saved or deleted: the page closes the editor, then reloads and says so. */
  onSaved: (notice: string, name: string | null) => void;
  /** Cancelled (after confirming, if there were edits). */
  onDiscard: () => void;
  /** Back / Android back / a forced close: the draft stays in sessionStorage. */
  onKeep: () => void;
  /** Phone: the sheet has finished animating out. */
  onExited?: () => void;
}) {
  const [initial] = useState(() => initialDraft(alias, initialName));
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [extras, setExtras] = useState<string[]>(initial.extras);
  const [people, setPeople] = useState(initial.recipients.people);
  const [groups, setGroups] = useState(initial.recipients.groups);
  const [external, setExternal] = useState(initial.recipients.external);
  const [roles, setRoles] = useState<string[]>(initial.recipients.roles);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  // A draft left by an earlier back, offered until restored or dismissed.
  const [stored, setStored] = useState<AliasDraft | null>(() => {
    if (typeof window === "undefined") return null;
    const draft = loadAliasDraft(draftKey);
    return draft && !sameDraft(draft, initial) ? draft : null;
  });

  const nameRef = useRef<HTMLInputElement>(null);
  const extrasRef = useRef<RecipientInputHandle>(null);
  const peopleRef = useRef<RecipientInputHandle>(null);
  const groupsRef = useRef<RecipientInputHandle>(null);
  const externalRef = useRef<RecipientInputHandle>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  // Set by the user's first edit: only then does the form mirror itself to
  // storage (never on mount, which would wipe a draft still on offer).
  const touched = useRef(false);
  // Saved, deleted or discarded: nothing may write the draft back.
  const finished = useRef(false);
  const hintId = useId();

  const touch =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      touched.current = true;
      set(value);
    };

  const recipients: Recipients = { people, groups, external, roles };
  const current: AliasDraft = { name, description, extras, recipients };
  const dirty = !sameDraft(current, initial);
  const snapshot = JSON.stringify(current);

  useLayoutEffect(() => {
    statusRef.current = {
      dirty: touched.current && dirty && !finished.current,
    };
  });

  useEffect(() => {
    if (!touched.current || finished.current) return;
    const draft = JSON.parse(snapshot) as AliasDraft;
    if (sameDraft(draft, initial)) clearAliasDraft(draftKey);
    else saveAliasDraft(draftKey, draft);
  }, [snapshot, draftKey, initial]);

  // Desk: the inline editor replaces the list, so bring its top into view.
  useLayoutEffect(() => {
    if (!phone) panelRef.current?.scrollIntoView({ block: "start" });
  }, [phone]);

  // Unchanged recipients: the server's own answer (it knows synced members).
  const delivered =
    alias && sameRecipients(recipients, alias.recipients)
      ? alias.delivered
      : resolve(recipients, directory);

  const ready =
    Boolean(name) &&
    (alias?.synced ||
      people.length + groups.length + external.length + roles.length > 0);
  const hint = !name
    ? "Give the alias a name, then add who it delivers to."
    : "Add a role, a person, a group or an address to deliver to.";

  const showError = (message: string) => {
    setError(message);
    if (phone) {
      requestAnimationFrame(() =>
        errorRef.current?.scrollIntoView({ block: "nearest" }),
      );
    }
  };

  const run = async (
    kind: "save" | "delete",
    work: () => Promise<string>,
    savedName: string | null,
  ) => {
    setBusy(kind);
    setError(null);
    try {
      const notice = await work();
      finished.current = true;
      clearAliasDraft(draftKey);
      setBusy(null);
      onSaved(notice, savedName);
    } catch (err) {
      setBusy(null);
      showError(errorText(err, `Could not ${kind} this alias.`));
    }
  };

  const save = () => {
    if (busy) return;
    // Text still in a chip field counts, typed or picked (admin-missed-2).
    const nextExtras = extrasRef.current?.commit() ?? extras;
    const next: Recipients = {
      people: peopleRef.current?.commit() ?? people,
      groups: groupsRef.current?.commit() ?? groups,
      external: externalRef.current?.commit() ?? external,
      roles,
    };
    const bad = next.external.find((address) => !EMAIL.test(address));
    if (bad) return showError(`"${bad}" is not an email address.`);
    const aliases = nextExtras.map((one) => one.replace(/@.*$/, ""));
    void run(
      "save",
      async () => {
        const saved = alias
          ? await updateAlias(
              alias.name,
              alias.synced
                ? { description, aliases }
                : { description, aliases, recipients: next },
            )
          : await createAlias({ name, description, aliases, recipients: next });
        return "rehearsed" in saved ? REHEARSED : `Saved ${saved.address}.`;
      },
      alias?.name ?? name,
    );
  };

  const remove = async () => {
    if (!alias || busy) return;
    const ok = await ask({
      title: `Delete ${alias.address}?`,
      detail: "Mail sent there will bounce from now on.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (ok === null) return;
    void run(
      "delete",
      async () =>
        (await deleteAlias(alias.name))?.rehearsed
          ? REHEARSED
          : `Deleted ${alias.address}.`,
      null,
    );
  };

  /** Save tapped while it can't save: say why and go to what's missing. */
  const explain = () => {
    if (!dirty && ready) {
      announce("No changes to save yet.");
      return;
    }
    announce(hint);
    if (!name) nameRef.current?.focus();
    else peopleRef.current?.focus();
  };

  const cancel = async () => {
    if (busy) return;
    if (dirty) {
      const ok = await ask({
        title: "Discard changes?",
        detail: "Your edits to this alias won't be saved.",
        confirmLabel: "Discard",
        destructive: true,
      });
      if (ok === null) return;
      clearAliasDraft(draftKey);
    }
    finished.current = true;
    onDiscard();
  };

  const keep = () => {
    if (touched.current && dirty && !finished.current) {
      saveAliasDraft(draftKey, current);
    }
    onKeep();
  };

  const onSheetClose = (reason: SheetCloseReason) => {
    if (busy) return;
    switch (reason) {
      case "close-button":
        void cancel();
        return;
      case "cancel":
        // Coarse pointers: Android back and iPad Esc are "go back", which
        // keeps the edits. A fine-pointer Esc is an explicit dismissal.
        if (mediaMatches(COARSE_QUERY)) keep();
        else if (!isAskOpen()) void cancel();
        return;
      case "forced":
        keep();
        return;
      case "backdrop":
        return;
    }
  };

  const restore = () => {
    if (!stored) return;
    touched.current = true;
    if (!alias) setName(stored.name);
    setDescription(stored.description);
    setExtras(stored.extras);
    if (!alias?.synced) {
      setPeople(stored.recipients.people);
      setGroups(stored.recipients.groups);
      setExternal(stored.recipients.external);
      setRoles(stored.recipients.roles);
    }
    setStored(null);
    announce("Unsaved changes restored.");
  };

  const dismissStored = () => {
    clearAliasDraft(draftKey);
    setStored(null);
  };

  const toggleRole = (id: string, on: boolean) =>
    touch(setRoles)(
      on ? [...new Set([...roles, id])] : roles.filter((one) => one !== id),
    );

  const title = alias ? alias.address : "New alias";

  const restoreOffer = stored && (
    <div className="flex flex-wrap items-center gap-2 rounded-[10px] border-2 border-line bg-tint px-3 py-2">
      <p className="min-w-0 flex-1 text-sm font-semibold text-ink">
        You left changes here without saving.
      </p>
      <div className="flex gap-2">
        <Button onClick={dismissStored} size="sm" type="button" variant="ghost">
          Dismiss
        </Button>
        <Button onClick={restore} size="sm" type="button" variant="secondary">
          Restore unsaved changes
        </Button>
      </div>
    </div>
  );

  const roleCloud = (
    <div className="rounded-[10px] border-2 border-line px-2 py-1.5">
      <span className="px-1 text-sm font-bold text-subtle">Roles</span>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {directory.roleGroups.map((group) => {
          const on = roles.includes(group.id);
          const covers = directory.roleMembers[group.id]?.length ?? 0;
          return (
            <button
              aria-describedby={`${hintId}-role-${group.id}`}
              aria-pressed={on}
              className={`rounded-full border-2 border-line px-2.5 py-0.5 text-sm font-semibold pointer-coarse:py-2 ${
                on
                  ? "bg-brand text-brand-ink"
                  : "bg-surface text-ink hover:bg-tint"
              }`}
              key={group.id}
              onClick={() => toggleRole(group.id, !on)}
              title={group.detail}
              type="button"
            >
              {group.label}
              <span
                className={on ? "opacity-80" : "text-subtle"}
              >{` ${covers}`}</span>
              <span className="sr-only" id={`${hintId}-role-${group.id}`}>
                {group.detail}, {peopleCount(covers)}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 px-1 text-xs text-subtle">
        A role keeps itself current: whoever holds it when mail arrives is who
        receives it.
      </p>
    </div>
  );

  const roleRows = (
    <ListGroup
      footer="A role keeps itself current: whoever holds it when mail arrives is who receives it."
      header="Roles"
    >
      {directory.roleGroups.map((group) => (
        <ListRow
          detail={group.detail}
          key={group.id}
          switchProps={{
            checked: roles.includes(group.id),
            onChange: (on) => toggleRole(group.id, on),
          }}
          title={group.label}
          value={peopleCount(directory.roleMembers[group.id]?.length ?? 0)}
        />
      ))}
    </ListGroup>
  );

  const names = new Map(directory.people.map((p) => [p.address, p.name]));

  const form = (
    <form
      className="flex flex-col gap-4"
      id="alias-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        if (!ready || (phone && !dirty)) explain();
        else save();
      }}
    >
      {phone && restoreOffer}
      {phone && !ready && (
        <p className="text-sm font-semibold text-subtle" id={hintId}>
          {hint}
        </p>
      )}
      {phone && error && (
        <div ref={errorRef} role="alert">
          <Note>{error}</Note>
        </div>
      )}
      {!phone && restoreOffer}
      <div>
        <Label htmlFor="alias-name">Name</Label>
        {alias && (
          // A saved name is locked; below lg the disabled field renders
          // dashed (reads as a placeholder), so show it as plain text there.
          <p className="hidden py-2 font-mono text-base font-semibold break-all text-ink max-lg:block pointer-coarse:block">
            {alias.address}
          </p>
        )}
        <div
          className={`flex items-center gap-2 ${alias ? "max-lg:hidden pointer-coarse:hidden" : ""}`}
        >
          <input
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            className={field}
            disabled={!!alias}
            enterKeyHint="next"
            id="alias-name"
            onChange={(e) =>
              touch(setName)(e.target.value.trim().toLowerCase())
            }
            placeholder="events"
            ref={nameRef}
            spellCheck={false}
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
          enterKeyHint="done"
          id="alias-description"
          maxLength={200}
          onChange={(e) => touch(setDescription)(e.target.value)}
          placeholder="Who this is for"
          value={description}
        />
      </div>
      <RecipientInput
        contacts={[]}
        kind="local"
        label="Also"
        onChange={touch(setExtras)}
        placeholder="another local part, like team"
        ref={extrasRef}
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
          <div className="max-sm:hidden">{roleCloud}</div>
          <div className="sm:hidden">{roleRows}</div>
          <RecipientInput
            browse
            contacts={directory.people.map((p) => ({
              name: p.name,
              email: p.address,
            }))}
            display={(email) => names.get(email) ?? email}
            empty="Everyone with a mailbox is already on this alias."
            label="People"
            onChange={touch(setPeople)}
            placeholder="Pick from the club"
            ref={peopleRef}
            value={people}
          />
          <RecipientInput
            browse
            contacts={directory.aliases
              .filter((one) => one.id !== alias?.id)
              .map((one) => ({ name: one.name, email: one.address }))}
            empty="No other alias to nest yet."
            label="Groups"
            onChange={touch(setGroups)}
            placeholder="Pick another alias"
            ref={groupsRef}
            value={groups}
          />
          <RecipientInput
            contacts={[]}
            inputMode="email"
            kind="address"
            label="External"
            onChange={touch(setExternal)}
            placeholder="anyone@elsewhere.com"
            ref={externalRef}
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

      {!phone && error && <Note>{error}</Note>}

      {!phone && (
        <>
          {!ready && (
            <p className="text-sm font-semibold text-subtle" id={hintId}>
              {hint}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              aria-describedby={!ready ? hintId : undefined}
              disabled={!ready || busy !== null}
              type="submit"
            >
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
        </>
      )}

      {phone && alias && !alias.synced && (
        <div className="mt-2 border-t-2 border-line/15 pt-6">
          <Button
            className="h-auto min-h-12 w-full whitespace-normal py-2 wrap-anywhere"
            disabled={busy !== null}
            onClick={remove}
            type="button"
            variant="outline-destructive"
          >
            {busy === "delete" ? "Deleting…" : `Delete ${alias.address}`}
          </Button>
        </div>
      )}
    </form>
  );

  if (phone) {
    const saveDisabled = !ready || !dirty;
    return (
      <Sheet
        bodyClassName="px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        dismissible={busy === null}
        onClose={onSheetClose}
        onExited={onExited}
        open={open}
        presentation="full"
        title={title}
        topBar={{
          leading: (
            <button
              aria-disabled={busy !== null || undefined}
              className="press-flat min-h-11 rounded-[10px] px-3 font-bold text-ink aria-disabled:opacity-50"
              onClick={() => onSheetClose("close-button")}
              type="button"
            >
              Cancel
            </button>
          ),
          trailing: (
            <Button
              aria-busy={busy === "save" || undefined}
              aria-describedby={!ready ? hintId : undefined}
              aria-disabled={saveDisabled || busy !== null || undefined}
              className="min-w-11 px-4 aria-disabled:opacity-50"
              form="alias-form"
              type="submit"
            >
              {busy === "save" ? "Saving…" : "Save"}
            </Button>
          ),
        }}
      >
        {form}
      </Sheet>
    );
  }

  if (!open) return null;

  return (
    <div
      className="scroll-mt-4"
      onKeyDown={(e) => {
        // Fine-pointer Esc dismisses the inline editor, asking first if dirty.
        if (e.key !== "Escape" || e.defaultPrevented) return;
        if (mediaMatches(COARSE_QUERY) || isAskOpen()) return;
        e.preventDefault();
        void cancel();
      }}
      ref={panelRef}
    >
      <Panel
        action={
          <Button
            disabled={busy !== null}
            onClick={() => void cancel()}
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
        title={title}
        titleClassName={alias ? "normal-case font-mono tracking-normal" : ""}
      >
        {form}
      </Panel>
    </div>
  );
}
