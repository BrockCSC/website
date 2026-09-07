"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Inbox } from "@/app/api/mail/inboxes/route";

const STALE = 60_000;

export const withAs = (path: string, viewing: string | null) =>
  viewing
    ? `${path}${path.includes("?") ? "&" : "?"}as=${encodeURIComponent(viewing)}`
    : path;

export const matchesInbox = (inbox: Inbox, needle: string) =>
  [inbox.name, inbox.username, inbox.address].some((value) =>
    value.toLowerCase().includes(needle),
  );

export const fetchInboxes = () =>
  fetch("/api/mail/inboxes")
    .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
    .then((data: { inboxes: Inbox[] }) => data.inboxes);

export const useInboxes = () => {
  const [inboxes, setInboxes] = useState<Inbox[] | null>(null);
  const [failed, setFailed] = useState(false);
  const fetchedAt = useRef(0);
  const load = useCallback(() => {
    if (Date.now() - fetchedAt.current < STALE) return;
    fetchedAt.current = Date.now();
    fetchInboxes()
      .then((list) => {
        setInboxes(list);
        setFailed(false);
      })
      .catch(() => {
        fetchedAt.current = 0;
        setFailed(true);
      });
  }, []);
  return { inboxes, failed, load };
};

type Row = Pick<Inbox, "name" | "address" | "unread" | "readOnly"> & {
  username: string | null;
};

export function InboxPicker({
  inboxes,
  failed,
  self,
  viewing,
  open,
  onOpen,
  onClose,
  onPick,
}: {
  inboxes: Inbox[] | null;
  failed: boolean;
  self: string | null;
  viewing: { name: string; address?: string } | null;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPick: (username: string | null) => void;
}) {
  const [text, setText] = useState("");
  const [highlight, setHighlight] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const needle = text.trim().toLowerCase();

  const groups = useMemo(() => {
    const mine = inboxes?.find((inbox) => inbox.address === self);
    const you: Row = {
      ...(mine ?? { address: self ?? "", unread: null, readOnly: false }),
      username: null,
      name: "Your inbox",
    };
    const others = (inboxes ?? []).filter(
      (inbox) => inbox !== mine && (!needle || matchesInbox(inbox, needle)),
    );
    return [
      { label: "You", rows: [you] },
      {
        label: "Current executives",
        rows: others.filter((inbox) => inbox.current && !inbox.readOnly),
      },
      {
        label: "Past executives",
        rows: others.filter((inbox) => !inbox.current || inbox.readOnly),
      },
    ].filter((group) => group.rows.length);
  }, [inboxes, needle, self]);

  const rows = useMemo<Row[]>(
    () => groups.flatMap((group) => group.rows),
    [groups],
  );
  const index = highlight < rows.length ? highlight : 0;

  const close = useCallback(() => {
    onClose();
    setText("");
    setHighlight(0);
  }, [onClose]);

  const pick = useCallback(
    (row: Row) => {
      onPick(row.username);
      close();
    },
    [onPick, close],
  );

  useEffect(() => {
    if (!open) return;
    const button = trigger.current;
    return () => button?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !panel.current?.contains(target) &&
        !trigger.current?.contains(target)
      )
        close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, close]);

  useEffect(() => {
    panel.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!rows.length) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((index + step + rows.length) % rows.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (rows[index]) pick(rows[index]);
    }
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        onClick={open ? close : onOpen}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex w-full items-center gap-2 rounded-[10px] border-2 border-line bg-surface px-3 py-2 text-left text-sm font-bold text-ink shadow-brut-sm hover:bg-tint"
      >
        <span className="min-w-0 flex-1">
          {viewing && (
            <span className="block text-[10px] font-extrabold tracking-wide text-brand uppercase">
              Read-only
            </span>
          )}
          <span className="block truncate">
            {viewing?.name ?? "Your inbox"}
          </span>
          <span className="block truncate text-xs font-medium text-subtle">
            {viewing?.address ?? self}
          </span>
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 transition-transform duration-[var(--dur-fast)] ease-smooth ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-label="Choose an inbox"
          onKeyDown={onKeyDown}
          className="absolute top-full left-0 z-20 mt-2 w-[min(20rem,calc(100vw-1.5rem))] animate-pop-in overflow-hidden rounded-[10px] border-2 border-line bg-surface shadow-brut"
        >
          <div className="border-b-2 border-line p-2">
            <input
              autoFocus
              type="search"
              autoComplete="off"
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setHighlight(0);
              }}
              aria-label="Search inboxes"
              placeholder="Name, username or address"
              className="w-full rounded-[8px] border-2 border-line bg-raised px-2 py-1 text-sm text-ink outline-none placeholder:text-subtle focus:border-brand"
            />
          </div>
          <div
            role="listbox"
            aria-label="Inboxes"
            className="max-h-72 overflow-y-auto p-1.5"
          >
            {!inboxes ? (
              <p
                className={`px-3 py-6 text-center text-sm ${failed ? "font-bold text-brand" : "text-subtle"}`}
              >
                {failed ? "Could not list inboxes." : "Loading…"}
              </p>
            ) : (
              groups.map((group) => (
                <div key={group.label} role="group" aria-label={group.label}>
                  <p className="px-2 pt-2 pb-1 text-[11px] font-extrabold tracking-wide text-subtle uppercase">
                    {group.label}
                  </p>
                  {group.rows.map((row) => {
                    const at = rows.indexOf(row);
                    return (
                      <button
                        key={row.username ?? ""}
                        type="button"
                        role="option"
                        aria-selected={at === index}
                        onMouseEnter={() => setHighlight(at)}
                        onClick={() => pick(row)}
                        className={`flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left ${at === index ? "bg-tint" : ""}`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-ink">
                            {row.name}
                          </span>
                          <span className="block truncate text-xs text-subtle">
                            {row.address}
                          </span>
                        </span>
                        {row.readOnly && (
                          <span className="shrink-0 text-[10px] font-bold tracking-wide text-subtle uppercase">
                            read-only
                          </span>
                        )}
                        {row.unread ? (
                          <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-brand-ink">
                            {row.unread}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
