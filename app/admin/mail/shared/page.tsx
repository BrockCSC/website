"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSession } from "../../session";
import { field, Label, Note, Panel } from "../../users/ui";
import {
  createSharedMailbox,
  errorText,
  fetchSharedMailboxes,
  type SharedMailboxes,
} from "./api";
import MailboxCard from "./mailbox-card";

export default function SharedMailboxesPage() {
  const { user } = useSession();
  const [directory, setDirectory] = useState<SharedMailboxes | null>(null);
  const [username, setUsername] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setDirectory(await fetchSharedMailboxes());
      setError(null);
    } catch {
      setError("Could not load shared mailboxes right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || creating) return;
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const result = await createSharedMailbox({
        username: username.trim().toLowerCase(),
        description: description.trim() || undefined,
      });
      await load();
      setUsername("");
      setDescription("");
      setNotice(
        result.rehearsed
          ? "Rehearsed — nothing was written."
          : `Created ${result.username}@${directory?.domain ?? ""}.`,
      );
    } catch (err) {
      setError(errorText(err, "Could not create that mailbox."));
    } finally {
      setCreating(false);
    }
  };

  if (!user?.isApprover) {
    return (
      <div className="mx-auto w-full max-w-[1060px] px-5 py-8">
        <Note>Only a co-president can manage shared mailboxes.</Note>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1060px] flex-col gap-5 px-5 py-8">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Shared mailboxes</h1>
        <p className="mt-1 max-w-prose text-subtle">
          Addresses like sponsorship@ or events@ that belong to a role rather
          than a member. Each is its own mailbox on the club domain, with its
          own app passwords for whoever answers it.
        </p>
      </div>

      <Panel
        note="Local part only — the domain is added for you."
        title="New shared mailbox"
      >
        <form className="flex flex-wrap items-end gap-3" onSubmit={create}>
          <div className="min-w-[180px]">
            <Label htmlFor="shared-username">Address</Label>
            <div className="flex items-center gap-2">
              <input
                className={field}
                id="shared-username"
                onChange={(e) => setUsername(e.target.value)}
                placeholder="sponsorship"
                value={username}
              />
              <span className="shrink-0 text-sm font-semibold text-subtle">
                @{directory?.domain ?? "brockcsc.ca"}
              </span>
            </div>
          </div>
          <div className="min-w-[220px] flex-1">
            <Label htmlFor="shared-description">Description</Label>
            <input
              className={field}
              id="shared-description"
              maxLength={200}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Who this is for"
              value={description}
            />
          </div>
          <Button disabled={creating || !username.trim()} type="submit">
            {creating ? "Creating…" : "Create"}
          </Button>
        </form>
      </Panel>

      {directory && !directory.identitiesEditable && (
        <Note>
          This environment shares the live mail server, so changes here are
          rehearsed, not written: you see exactly what would happen, and nothing
          reaches a real address.
        </Note>
      )}
      {directory && !directory.mailboxes.length && !loading && (
        <p className="text-subtle">No shared mailboxes yet.</p>
      )}
      {error && <Note>{error}</Note>}
      {notice && <Note>{notice}</Note>}
      {loading && <p className="text-subtle">Loading...</p>}

      <div className="flex flex-col gap-4">
        {directory?.mailboxes.map((mailbox) => (
          <MailboxCard
            domain={directory.domain}
            key={mailbox.username}
            mailbox={mailbox}
            onChanged={async (message) => {
              await load();
              setNotice(message);
            }}
          />
        ))}
      </div>
    </div>
  );
}
