"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { ask } from "../../ask";
import { field, Label, Note, Panel, Pill, Rows } from "../../users/ui";
import { AppPasswords } from "../setup/app-passwords";
import { RecipientInput, type RecipientInputHandle } from "../recipient-input";
import {
  deleteSharedMailbox,
  errorText,
  updateSharedMailbox,
  type SharedMailbox,
} from "./api";

const REHEARSED = "Rehearsed — nothing was written.";

export default function MailboxCard({
  mailbox,
  domain,
  onChanged,
}: {
  mailbox: SharedMailbox;
  domain: string;
  onChanged: (notice: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(mailbox.description);
  const [aliases, setAliases] = useState<string[]>(mailbox.aliases);
  const [dailyLimit, setDailyLimit] = useState(
    mailbox.mailDailyLimit ? String(mailbox.mailDailyLimit) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [showAppPasswords, setShowAppPasswords] = useState(false);
  // Mounted on first open, then only hidden: hiding must not destroy a
  // just-created secret (admin-missed-3).
  const [appPasswordsMounted, setAppPasswordsMounted] = useState(false);
  const aliasesRef = useRef<RecipientInputHandle>(null);

  const save = async () => {
    setBusy("save");
    setError(null);
    const limit = dailyLimit.trim() ? Number(dailyLimit) : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
      setError("The daily limit must be a positive number.");
      setBusy(null);
      return;
    }
    // A typed local part counts without pressing Return.
    const nextAliases = aliasesRef.current?.commit() ?? aliases;
    try {
      const result = await updateSharedMailbox(mailbox.username, {
        description,
        aliases: nextAliases,
        ...(limit !== undefined ? { mailDailyLimit: limit } : {}),
      });
      setEditing(false);
      await onChanged(result.rehearsed ? REHEARSED : "Saved.");
    } catch (err) {
      setError(errorText(err, "Could not save that."));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const ok = await ask({
      title: `Delete ${mailbox.address}?`,
      detail:
        "The mailbox is destroyed for good, along with every app password made for it. This cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (ok === null) return;
    setBusy("delete");
    setError(null);
    try {
      const result = await deleteSharedMailbox(mailbox.username);
      await onChanged(
        result?.rehearsed ? REHEARSED : `Deleted ${mailbox.address}.`,
      );
    } catch (err) {
      const message = errorText(err, "Could not delete this mailbox.");
      setError(message);
      toast({ tone: "error", message });
      setBusy(null);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setDescription(mailbox.description);
    setAliases(mailbox.aliases);
    setDailyLimit(mailbox.mailDailyLimit ? String(mailbox.mailDailyLimit) : "");
    setError(null);
  };

  return (
    <Panel
      action={
        !editing && (
          <div className="flex gap-2">
            <Button
              disabled={busy !== null}
              onClick={() => setEditing(true)}
              size="sm"
              type="button"
              variant="secondary"
            >
              Edit
            </Button>
            {/* Phones: Delete lives at the end of the edit form. */}
            <Button
              className="phone:hidden"
              disabled={busy !== null}
              onClick={remove}
              size="sm"
              type="button"
              variant="destructive"
            >
              {busy === "delete" ? "Deleting…" : "Delete"}
            </Button>
          </div>
        )
      }
      note={mailbox.description || undefined}
      title={mailbox.address}
      titleClassName="normal-case font-mono tracking-normal"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={mailbox.provisioned ? "accent" : "flat"}>
            {mailbox.provisioned ? "Provisioned" : "Not created yet"}
          </Pill>
          {mailbox.readOnly && <Pill>Read-only</Pill>}
          {mailbox.provisioned && (
            <span className="text-sm text-subtle">
              {mailbox.unread ?? "—"} unread of {mailbox.total ?? "—"}
            </span>
          )}
        </div>

        {editing ? (
          <div className="flex flex-col gap-3">
            <div>
              <Label htmlFor={`${mailbox.username}-description`}>
                Description
              </Label>
              <input
                className={field}
                enterKeyHint="done"
                id={`${mailbox.username}-description`}
                maxLength={200}
                onChange={(e) => setDescription(e.target.value)}
                value={description}
              />
            </div>
            <RecipientInput
              contacts={[]}
              kind="local"
              label="Aliases"
              onChange={setAliases}
              placeholder="another local part, like sponsors"
              ref={aliasesRef}
              value={aliases}
            />
            <div>
              <Label htmlFor={`${mailbox.username}-limit`}>
                Daily send limit
              </Label>
              <input
                autoComplete="off"
                className={field}
                enterKeyHint="done"
                id={`${mailbox.username}-limit`}
                inputMode="numeric"
                onChange={(e) => setDailyLimit(e.target.value)}
                pattern="[0-9]*"
                placeholder="Club default"
                type="text"
                value={dailyLimit}
              />
            </div>
            {error && <Note>{error}</Note>}
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy !== null} onClick={save} type="button">
                {busy === "save" ? "Saving…" : "Save"}
              </Button>
              <Button
                disabled={busy !== null}
                onClick={cancelEdit}
                type="button"
                variant="secondary"
              >
                Cancel
              </Button>
            </div>
            <div className="mt-3 border-t-2 border-line/15 pt-5 desk:hidden">
              <Button
                className="h-auto min-h-12 w-full py-2 whitespace-normal wrap-anywhere"
                disabled={busy !== null}
                onClick={remove}
                type="button"
                variant="outline-destructive"
              >
                {busy === "delete" ? "Deleting…" : `Delete ${mailbox.address}`}
              </Button>
            </div>
          </div>
        ) : (
          <Rows
            items={[
              [
                "Aliases",
                mailbox.aliases.length
                  ? mailbox.aliases.map((one) => `${one}@${domain}`).join(", ")
                  : "None",
              ],
              [
                "Daily send limit",
                mailbox.mailDailyLimit
                  ? String(mailbox.mailDailyLimit)
                  : "Club default",
              ],
              ["Created by", mailbox.createdBy],
            ]}
          />
        )}

        {error && !editing && <Note>{error}</Note>}

        <div>
          <Button
            aria-expanded={showAppPasswords}
            onClick={() => {
              setAppPasswordsMounted(true);
              setShowAppPasswords((v) => !v);
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            {showAppPasswords ? "Hide app passwords" : "Manage app passwords"}
          </Button>
          {appPasswordsMounted && (
            <div
              className="mt-3 rounded-[14px] border-2 border-line bg-raised p-4 max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0"
              hidden={!showAppPasswords}
            >
              <AppPasswords
                endpoint={`/api/mail/shared/${encodeURIComponent(mailbox.username)}/app-passwords`}
                inputId={`${mailbox.username}-app-password-name`}
              />
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
