"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { AdminPage } from "../../page-frame";
import { useSession } from "../../session";
import { field, Label, Note, Panel } from "../../users/ui";
import {
  createSharedMailbox,
  errorText,
  fetchSharedMailboxes,
  type SharedMailboxes,
} from "./api";
import MailboxCard from "./mailbox-card";

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

/** The create form: a panel on sm+, a sheet from the "New" button below sm. */
function CreateForm({
  idPrefix,
  domain,
  username,
  description,
  creating,
  stacked,
  onUsername,
  onDescription,
  onSubmit,
}: {
  idPrefix: string;
  domain: string;
  username: string;
  description: string;
  creating: boolean;
  /** One field per row with a full-width Create (the phone sheet). */
  stacked?: boolean;
  onUsername: (value: string) => void;
  onDescription: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form
      className={
        stacked ? "flex flex-col gap-4" : "flex flex-wrap items-end gap-3"
      }
      onSubmit={onSubmit}
    >
      <div className="w-full sm:w-auto sm:min-w-[180px]">
        <Label htmlFor={`${idPrefix}-username`}>Address</Label>
        <div className="flex items-center gap-2">
          <input
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            className={field}
            enterKeyHint="next"
            id={`${idPrefix}-username`}
            onChange={(e) => onUsername(e.target.value)}
            placeholder="sponsorship"
            spellCheck={false}
            value={username}
          />
          <span className="shrink-0 text-sm font-semibold text-subtle">
            @{domain}
          </span>
        </div>
      </div>
      <div className={stacked ? "" : "min-w-[220px] flex-1"}>
        <Label htmlFor={`${idPrefix}-description`}>Description</Label>
        <input
          className={field}
          enterKeyHint="done"
          id={`${idPrefix}-description`}
          maxLength={200}
          onChange={(e) => onDescription(e.target.value)}
          placeholder="Who this is for"
          value={description}
        />
      </div>
      <Button
        className={stacked ? "w-full" : undefined}
        disabled={creating || !username.trim()}
        type="submit"
      >
        {creating ? "Creating…" : "Create"}
      </Button>
    </form>
  );
}

export default function SharedMailboxesPage() {
  const { user } = useSession();
  const [directory, setDirectory] = useState<SharedMailboxes | null>(null);
  const [username, setUsername] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
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

  const say = (message: string) => {
    setNotice(message);
    afterDialogs(() => toast({ message }));
  };

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
      setSheetOpen(false);
      say(
        result.rehearsed
          ? REHEARSED
          : `Created ${result.username}@${directory?.domain ?? ""}.`,
      );
    } catch (err) {
      const message = errorText(err, "Could not create that mailbox.");
      setError(message);
      if (!sheetOpen) toast({ tone: "error", message });
    } finally {
      setCreating(false);
    }
  };

  if (!user?.isApprover) {
    return (
      <AdminPage>
        <Note>Only a co-president can manage shared mailboxes.</Note>
      </AdminPage>
    );
  }

  const domain = directory?.domain ?? "brockcsc.ca";

  return (
    <AdminPage className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold text-ink">Shared mailboxes</h1>
          <p className="mt-1 max-w-prose text-subtle max-sm:hidden">
            Addresses like sponsorship@ or events@ that belong to a role rather
            than a member. Each is its own mailbox on the club domain, with its
            own app passwords for whoever answers it.
          </p>
          <p className="mt-1 text-subtle sm:hidden">
            Role addresses, each its own mailbox with its own app passwords.
          </p>
        </div>
        <Button
          className="min-h-11 sm:hidden"
          onClick={() => {
            setError(null);
            setSheetOpen(true);
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus aria-hidden />
          New
        </Button>
      </div>

      <div className="max-sm:hidden">
        <Panel
          note="Local part only — the domain is added for you."
          title="New shared mailbox"
        >
          <CreateForm
            creating={creating}
            description={description}
            domain={domain}
            idPrefix="shared"
            onDescription={setDescription}
            onSubmit={create}
            onUsername={setUsername}
            username={username}
          />
        </Panel>
      </div>

      <Sheet
        description="Local part only — the domain is added for you."
        dismissible={!creating}
        onClose={() => setSheetOpen(false)}
        open={sheetOpen}
        title="New shared mailbox"
      >
        {error && sheetOpen && (
          <div className="mb-3" role="alert">
            <Note>{error}</Note>
          </div>
        )}
        <CreateForm
          creating={creating}
          description={description}
          domain={domain}
          idPrefix="shared-sheet"
          onDescription={setDescription}
          onSubmit={create}
          onUsername={setUsername}
          stacked
          username={username}
        />
      </Sheet>

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
      {notice && (
        <div className="phone:hidden">
          <Note>{notice}</Note>
        </div>
      )}
      {loading && <p className="text-subtle">Loading...</p>}

      <div className="flex flex-col gap-4">
        {directory?.mailboxes.map((mailbox) => (
          <MailboxCard
            domain={directory.domain}
            key={mailbox.username}
            mailbox={mailbox}
            onChanged={async (message) => {
              await load();
              say(message);
            }}
          />
        ))}
      </div>
    </AdminPage>
  );
}
