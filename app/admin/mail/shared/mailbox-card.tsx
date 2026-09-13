"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ask } from "../../ask";
import { field, Label, Note, Panel, Pill, Rows } from "../../users/ui";
import { AppPasswords } from "../setup/app-passwords";
import { RecipientInput } from "../recipient-input";
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

  const save = async () => {
    setBusy("save");
    setError(null);
    const limit = dailyLimit.trim() ? Number(dailyLimit) : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
      setError("The daily limit must be a positive number.");
      setBusy(null);
      return;
    }
    try {
      const result = await updateSharedMailbox(mailbox.username, {
        description,
        aliases,
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
      setError(errorText(err, "Could not delete this mailbox."));
      setBusy(null);
    }
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
            <Button
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
                id={`${mailbox.username}-description`}
                maxLength={200}
                onChange={(e) => setDescription(e.target.value)}
                value={description}
              />
            </div>
            <RecipientInput
              contacts={[]}
              label="Aliases"
              onChange={setAliases}
              placeholder="another local part, like sponsors"
              value={aliases}
            />
            <div>
              <Label htmlFor={`${mailbox.username}-limit`}>
                Daily send limit
              </Label>
              <input
                className={field}
                id={`${mailbox.username}-limit`}
                min={1}
                onChange={(e) => setDailyLimit(e.target.value)}
                placeholder="Club default"
                type="number"
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
                onClick={() => {
                  setEditing(false);
                  setDescription(mailbox.description);
                  setAliases(mailbox.aliases);
                  setDailyLimit(
                    mailbox.mailDailyLimit
                      ? String(mailbox.mailDailyLimit)
                      : "",
                  );
                  setError(null);
                }}
                type="button"
                variant="secondary"
              >
                Cancel
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
            onClick={() => setShowAppPasswords((v) => !v)}
            size="sm"
            type="button"
            variant="outline"
          >
            {showAppPasswords ? "Hide app passwords" : "Manage app passwords"}
          </Button>
          {showAppPasswords && (
            <div className="mt-3 rounded-[14px] border-2 border-line bg-raised p-4">
              <AppPasswords
                endpoint={`/api/mail/shared/${encodeURIComponent(mailbox.username)}/app-passwords`}
              />
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
