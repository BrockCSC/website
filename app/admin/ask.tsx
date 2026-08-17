"use client";

import { useEffect, useRef, useState } from "react";

export type AskOptions = {
  title: string;
  detail?: string;
  placeholder?: string;
  confirmLabel?: string;
  destructive?: boolean;
  withInput?: boolean;
  required?: boolean;
};

type Pending = AskOptions & { resolve: (value: string | null) => void };

let open: ((pending: Pending) => void) | null = null;

export const ask = (options: AskOptions): Promise<string | null> =>
  new Promise((resolve) => {
    if (!open) return resolve(null);
    open({ ...options, resolve });
  });

export function AskHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    open = (next) => {
      setPending(next);
      setValue("");
    };
    return () => {
      open = null;
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    (pending.withInput ? field : cancel).current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        pending.resolve(null);
        setPending(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending]);

  if (!pending) return null;

  const settle = (result: string | null) => {
    pending.resolve(result);
    setPending(null);
  };

  const blocked = pending.withInput && pending.required && !value.trim();

  return (
    <div
      className="fixed inset-0 z-[60] flex animate-fade-in items-center justify-center bg-ink/40 px-4"
      onMouseDown={(event) =>
        event.target === event.currentTarget && settle(null)
      }
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={pending.title}
        className="w-full max-w-md animate-pop-in rounded-[20px] border-2 border-line bg-surface p-6 shadow-brut"
      >
        <h2 className="text-lg font-extrabold text-ink">{pending.title}</h2>
        {pending.detail && (
          <p className="mt-2 text-sm text-subtle">{pending.detail}</p>
        )}

        {pending.withInput && (
          <input
            ref={field}
            value={value}
            placeholder={pending.placeholder}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) =>
              event.key === "Enter" && !blocked && settle(value.trim())
            }
            className="mt-4 w-full rounded-[10px] border-2 border-line bg-surface px-3 py-2 text-ink focus:border-brand focus:outline-none"
          />
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancel}
            type="button"
            onClick={() => settle(null)}
            className="rounded-[10px] border-2 border-line px-4 py-2 font-bold text-ink hover:bg-tint"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={blocked}
            onClick={() => settle(pending.withInput ? value.trim() : "")}
            className={`rounded-[10px] border-2 border-line px-4 py-2 font-bold shadow-brut-sm disabled:opacity-50 ${
              pending.destructive
                ? "bg-destructive text-white"
                : "bg-brand text-brand-ink"
            }`}
          >
            {pending.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
