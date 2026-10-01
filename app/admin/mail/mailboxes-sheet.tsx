"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  AtSign,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Folder,
  Inbox as InboxIcon,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Smartphone,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Mailbox } from "@/lib/mail/jmap-mail";
import type { Inbox } from "@/app/api/mail/inboxes/route";
import { ListGroup, ListRow } from "@/components/ui/list-group";
import { Sheet } from "@/components/ui/sheet";
import { useCloseWatcher } from "@/lib/use-close-watcher";
import { useCoarsePointer } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { AllowanceMeter, type AllowanceProps } from "./allowance";
import { inboxGroups, type InboxRow } from "./inbox-picker";

// The phone folder switcher (spec §3.2 step 5): opened from the list's
// top-bar title. It also refreshes the list, switches inboxes (mail admins),
// shows the send allowance and links to mail settings. In pick mode it is
// the "Move to…" chooser. A transient overlay: not in history.

const ROLE_ICONS: Record<string, LucideIcon> = {
  inbox: InboxIcon,
  sent: Send,
  drafts: FileText,
  archive: Archive,
  trash: Trash2,
  junk: ShieldAlert,
};

export const mailboxIcon = (box: Pick<Mailbox, "role">) =>
  (box.role && ROLE_ICONS[box.role]) || Folder;

const ROW =
  "press-flat flex min-h-13 w-full items-center gap-3 px-4 py-2.5 text-left text-ink";

function Tile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span
      aria-hidden
      className="grid size-9 shrink-0 place-items-center rounded-[10px] border-2 border-line"
    >
      <Icon className="size-5" />
    </span>
  );
}

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <>
      <span
        aria-hidden
        className="min-w-5 shrink-0 rounded-full border-2 border-line bg-brand px-1 text-center text-[11px] leading-4 font-bold text-brand-ink forced-colors:border-[CanvasText]"
      >
        {count}
      </span>
      <span className="sr-only">, {count} unread</span>
    </>
  );
}

export type MailboxesSheetMode =
  | { kind: "browse"; view?: "folders" | "inboxes" }
  | { kind: "pick"; exclude: string[]; count: number };

export type AccountProps = {
  inboxes: Inbox[] | null;
  failed: boolean;
  load: () => void;
  self: string | null;
  viewing: { name: string; address?: string } | null;
  onPick: (username: string | null) => void;
};

export function MailboxesSheet({
  open,
  mode,
  onClose,
  mailboxes,
  current,
  onSelect,
  onPick,
  refreshed,
  onRefresh,
  account,
  allowance,
  settings,
  showSetup,
}: {
  open: boolean;
  mode: MailboxesSheetMode;
  onClose: () => void;
  mailboxes: Mailbox[];
  current: string | null;
  onSelect: (id: string) => void;
  onPick: (mailboxId: string) => void;
  /** "Updated 2 min ago", computed when the sheet opened. */
  refreshed: string | null;
  onRefresh: () => void;
  /** Mail admins: the inbox switcher. */
  account?: AccountProps;
  /** Own inbox only. */
  allowance?: AllowanceProps;
  settings: { aliases: boolean; shared: boolean };
  showSetup: boolean;
}) {
  const coarse = useCoarsePointer();
  const [view, setView] = useState<"folders" | "inboxes">("folders");
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);

  // Each open starts on the view the caller asked for, with an empty search.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setView(mode.kind === "browse" ? (mode.view ?? "folders") : "folders");
      setText("");
    }
  }

  // The pressed row goes away with the view: keep focus in the sheet.
  const focusTitle = () =>
    [...document.querySelectorAll("dialog[open]")]
      .at(-1)
      ?.querySelector<HTMLElement>("h2")
      ?.focus({ preventScroll: true });
  const swap = (next: "folders" | "inboxes") => {
    setView(next);
    if (next === "folders") requestAnimationFrame(focusTitle);
  };

  const picking = mode.kind === "pick";
  const inboxView = !picking && view === "inboxes" && account != null;
  const accountLoad = account?.load;

  useEffect(() => {
    if (!inboxView) return;
    accountLoad?.();
    if (!coarse) input.current?.focus();
    else focusTitle();
  }, [inboxView, coarse, accountLoad]);

  const needle = text.trim().toLowerCase();
  const groups = useMemo(
    () => (account ? inboxGroups(account.inboxes, account.self, needle) : []),
    [account, needle],
  );

  // Android back (Esc) on the inbox view returns to the folders, as the
  // back chevron does, rather than closing the sheet.
  useCloseWatcher(inboxView, () => swap("folders"));

  const title = picking ? (
    mode.count > 1 ? (
      `Move ${mode.count} conversations to`
    ) : (
      "Move to"
    )
  ) : inboxView ? (
    // Room for the back control, which sits in the title row but outside
    // the <h2> that names the dialog.
    <span className="block truncate pl-10">Choose an inbox</span>
  ) : (
    "Mailboxes"
  );

  const folders = picking
    ? mailboxes.filter((box) => !mode.exclude.includes(box.id))
    : mailboxes;

  const pickInbox = (row: InboxRow) => {
    onClose();
    account?.onPick(row.username);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      bodyClassName="space-y-5 bg-background px-4 pt-2 pb-4 phone:pb-[max(1rem,env(safe-area-inset-bottom))]"
      desktopClassName="desk:max-w-md"
    >
      {inboxView && account ? (
        <>
          {/* Positioned against the <dialog> (the body scroller isn't), so it
              lands in the header row beside the title and doesn't scroll. */}
          <button
            type="button"
            aria-label="Back to Mailboxes"
            onClick={() => swap("folders")}
            className="press-flat absolute top-2 left-2 z-10 grid size-11 place-items-center rounded-[10px] text-ink desk:top-4 desk:left-4"
          >
            <ChevronLeft aria-hidden className="size-6" strokeWidth={2.5} />
          </button>
          <label className="flex min-h-12 items-center gap-2 rounded-[16px] border-2 border-[var(--line-strong)] bg-surface px-3 focus-within:border-brand">
            <Search aria-hidden className="size-5 shrink-0 text-subtle" />
            <input
              ref={input}
              type="search"
              value={text}
              onChange={(event) => setText(event.target.value)}
              enterKeyHint="search"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Search inboxes"
              placeholder="Name, username or address"
              className="min-h-11 min-w-0 flex-1 bg-transparent py-2 text-base text-ink outline-none placeholder:text-subtle"
            />
          </label>
          {!account.inboxes ? (
            <p
              className={cn(
                "px-1 py-6 text-center text-sm",
                account.failed ? "font-bold text-ink" : "text-subtle",
              )}
            >
              {account.failed ? "Could not list inboxes." : "Loading…"}
            </p>
          ) : (
            groups.map((group) => (
              <ListGroup key={group.label} header={group.label}>
                {group.rows.map((row) => {
                  const active =
                    row.username === null
                      ? account.viewing == null
                      : row.name === account.viewing?.name;
                  return (
                    <li key={row.username ?? ""}>
                      <button
                        type="button"
                        aria-current={active ? "true" : undefined}
                        onClick={() => pickInbox(row)}
                        className={cn(ROW, "min-h-14")}
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-bold">{row.name}</span>
                          <span className="truncate text-sm text-subtle">
                            {row.address}
                            {row.readOnly && " · read-only"}
                          </span>
                        </span>
                        <Badge count={row.unread ?? 0} />
                        {active && (
                          <Check
                            aria-hidden
                            className="size-5 shrink-0"
                            strokeWidth={2.5}
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ListGroup>
            ))
          )}
        </>
      ) : (
        <>
          {!picking && (
            <ListGroup>
              <li>
                <button type="button" onClick={onRefresh} className={ROW}>
                  <Tile icon={RefreshCw} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-bold">Refresh</span>
                    {refreshed && (
                      <span className="truncate text-sm text-subtle">
                        {refreshed}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            </ListGroup>
          )}

          {!picking && account && (
            <ListGroup header="Account">
              <ListRow
                icon={<InboxIcon />}
                title={account.viewing?.name ?? "Your inbox"}
                detail={
                  account.viewing
                    ? `Read-only · ${account.viewing.address ?? ""}`
                    : (account.self ?? undefined)
                }
              />
              <ListRow
                icon={<Users />}
                title="Switch inbox"
                onPress={() => swap("inboxes")}
              />
            </ListGroup>
          )}

          <ListGroup header={picking ? undefined : "Folders"}>
            {folders.map((box) => {
              const active = !picking && box.id === current;
              return (
                <li key={box.id}>
                  <button
                    type="button"
                    aria-current={active ? "true" : undefined}
                    onClick={() => {
                      onClose();
                      if (picking) onPick(box.id);
                      else onSelect(box.id);
                    }}
                    className={ROW}
                  >
                    <Tile icon={mailboxIcon(box)} />
                    <span className="min-w-0 flex-1 truncate font-bold">
                      {box.name}
                    </span>
                    <Badge count={picking ? 0 : box.unreadEmails} />
                    {active && (
                      <Check
                        aria-hidden
                        className="size-5 shrink-0"
                        strokeWidth={2.5}
                      />
                    )}
                    {picking && (
                      <ChevronRight
                        aria-hidden
                        className="size-5 shrink-0 text-subtle"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ListGroup>

          {!picking && (allowance?.state || showSetup) && (
            <ListGroup>
              {allowance && <AllowanceMeter {...allowance} />}
              {showSetup && (
                <ListRow
                  icon={<Smartphone />}
                  title="Set up on your phone"
                  href="/admin/mail/setup"
                />
              )}
            </ListGroup>
          )}

          {!picking && (settings.aliases || settings.shared) && (
            <ListGroup header="Mail settings">
              {settings.aliases && (
                <ListRow
                  icon={<AtSign />}
                  title="Aliases"
                  href="/admin/mail/aliases"
                />
              )}
              {settings.shared && (
                <ListRow
                  icon={<Users />}
                  title="Shared mailboxes"
                  href="/admin/mail/shared"
                />
              )}
            </ListGroup>
          )}
        </>
      )}
    </Sheet>
  );
}
