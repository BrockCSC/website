"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { usePhone } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

export type AskOptions = {
  title: string;
  /** Line breaks are kept (whitespace-pre-line). */
  detail?: string;
  /** Rendered as a bulleted list under the detail. */
  items?: string[];
  placeholder?: string;
  confirmLabel?: string;
  destructive?: boolean;
  withInput?: boolean;
  required?: boolean;
  /** Keyboard hints for the input. 'url' and 'email' also turn off autocapitalise and autocorrect. */
  inputMode?: "text" | "url" | "email" | "numeric";
};

type Pending = AskOptions & {
  id: number;
  resolve: (value: string | null) => void;
};

let enqueue: ((pending: Pending) => void) | null = null;
let outstanding = 0;
let nextId = 0;

/** True while an ask is showing or queued. */
export const isAskOpen = () => outstanding > 0;

/**
 * A confirmation or a one-line prompt. Resolves with the input's text ("" for
 * a plain confirm) or null when cancelled. A second ask() while one is open
 * waits in a FIFO queue. The promise settles once the sheet has finished
 * closing, so the page is interactive again (focus, selection) when the
 * caller acts.
 */
export const ask = (options: AskOptions): Promise<string | null> =>
  new Promise((resolve) => {
    if (!enqueue) return resolve(null);
    let settled = false;
    outstanding += 1;
    nextId += 1;
    enqueue({
      ...options,
      id: nextId,
      resolve: (value) => {
        if (settled) return;
        settled = true;
        outstanding -= 1;
        resolve(value);
      },
    });
  });

type Leaving = { pending: Pending; result: string | null };

export function AskHost() {
  const [queue, setQueue] = useState<Pending[]>([]);
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  const live = useRef<{ queue: Pending[]; leaving: Leaving | null }>({
    queue: [],
    leaving: null,
  });

  useEffect(() => {
    live.current = { queue, leaving };
  });

  useEffect(() => {
    enqueue = (next) => setQueue((current) => [...current, next]);
    return () => {
      enqueue = null;
      // The shell went away (logout, route change): nobody will answer.
      live.current.leaving?.pending.resolve(null);
      for (const pending of live.current.queue) pending.resolve(null);
    };
  }, []);

  const current = queue[0] ?? null;
  // The next ask opens only after the previous one has finished closing.
  const shown = leaving?.pending ?? current;
  if (!shown) return null;

  const settle = (result: string | null) => {
    if (!current || leaving) return;
    setLeaving({ pending: current, result });
    setQueue((items) => items.filter((item) => item.id !== current.id));
  };

  const exited = () => {
    if (!leaving) return;
    leaving.pending.resolve(leaving.result);
    setLeaving(null);
  };

  return (
    <AskSheet
      key={shown.id}
      pending={shown}
      open={!leaving}
      onSettle={settle}
      onExited={exited}
    />
  );
}

const inputHints = (mode: AskOptions["inputMode"]) => {
  switch (mode) {
    case "url":
    case "email":
      return {
        type: mode,
        inputMode: mode,
        autoCapitalize: "off",
        autoCorrect: "off",
        spellCheck: false,
        enterKeyHint: "done",
      } as const;
    case "numeric":
      return { inputMode: "numeric", enterKeyHint: "done" } as const;
    default:
      return { enterKeyHint: "done" } as const;
  }
};

function AskSheet({
  pending,
  open,
  onSettle,
  onExited,
}: {
  pending: Pending;
  open: boolean;
  onSettle: (result: string | null) => void;
  onExited: () => void;
}) {
  const phone = usePhone();
  const [value, setValue] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  const blocked = Boolean(
    pending.withInput && pending.required && !value.trim(),
  );
  const confirm = () => {
    if (!blocked) onSettle(pending.withInput ? value.trim() : "");
  };

  // Phones: a plain confirm is an action sheet, an input ask a bottom sheet
  // that rides on the keyboard. Desk: today's centred card.
  const action = phone && !pending.withInput;

  return (
    <Sheet
      open={open}
      onClose={() => onSettle(null)}
      onExited={onExited}
      title={pending.title}
      description={
        pending.detail ? (
          <p className="pt-0.5 whitespace-pre-line">{pending.detail}</p>
        ) : undefined
      }
      presentation={action ? "action" : "sheet"}
      initialFocus={pending.withInput ? field : cancel}
      fitVisualViewport={Boolean(pending.withInput)}
      bodyClassName={action ? "px-4 pt-3 pb-4" : "desk:pt-0"}
    >
      {pending.items && pending.items.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-subtle phone:mt-0">
          {pending.items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      )}

      {pending.withInput && (
        <input
          ref={field}
          value={value}
          placeholder={pending.placeholder}
          aria-label={pending.title}
          {...inputHints(pending.inputMode)}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            confirm();
          }}
          className="mt-4 w-full rounded-[10px] border-2 border-[var(--line-strong)] bg-surface px-3 py-2 text-ink focus:border-brand focus:outline-none phone:mt-1 phone:min-h-12"
        />
      )}

      <div
        className={cn(
          "mt-6 flex justify-end gap-3 phone:mt-4 phone:flex-col-reverse phone:gap-2",
          action && !pending.items?.length && "phone:mt-0",
        )}
      >
        <button
          ref={cancel}
          type="button"
          onClick={() => onSettle(null)}
          className="rounded-[10px] border-2 border-line px-4 py-2 font-bold text-ink hover:bg-tint phone:min-h-12 phone:w-full phone:rounded-[16px] phone:press-flat"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={blocked}
          onClick={confirm}
          className={cn(
            "rounded-[10px] border-2 border-line px-4 py-2 font-bold shadow-brut-sm disabled:opacity-50 phone:min-h-12 phone:w-full phone:rounded-[16px] phone:press",
            pending.destructive
              ? "bg-destructive text-white max-lg:text-[var(--destructive-ink)] pointer-coarse:text-[var(--destructive-ink)]"
              : "bg-brand text-brand-ink",
          )}
        >
          {pending.confirmLabel ?? "Confirm"}
        </button>
      </div>
    </Sheet>
  );
}
