"use client";

import { useEffect } from "react";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[10px] border-2 border-line px-4 py-2 text-sm font-bold disabled:pointer-events-none disabled:opacity-50";

export const btn = {
  primary: `${base} bg-brand text-brand-ink shadow-brut-sm hover:-translate-y-0.5 motion-reduce:hover:translate-y-0`,
  secondary: `${base} bg-surface text-ink shadow-brut-sm hover:bg-tint`,
  danger: `${base} border-destructive bg-destructive text-surface shadow-brut-sm hover:-translate-y-0.5 motion-reduce:hover:translate-y-0`,
  quiet: `${base} border-transparent px-2.5 py-1.5 text-destructive hover:bg-tint`,
};

export const field =
  "w-full rounded-[10px] border-2 border-line bg-surface px-3 py-2 text-sm font-medium text-ink outline-none [color-scheme:light] focus:bg-tint dark:[color-scheme:dark]";

export const errorText =
  "mt-1 animate-rise-in text-xs font-bold text-destructive";

/** Full-screen on a phone, a centred dialog from `sm` up. */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      aria-label={title}
      aria-modal="true"
      className="fixed inset-0 z-50 flex sm:items-center sm:justify-center sm:p-6"
      role="dialog"
    >
      <div className="absolute inset-0 animate-fade-in bg-ink/40 dark:bg-surface/80" />
      <div className="relative flex h-full w-full animate-rise-in flex-col bg-surface sm:h-auto sm:max-h-[86vh] sm:max-w-[660px] sm:animate-pop-in sm:rounded-[20px] sm:border-2 sm:border-line sm:shadow-brut">
        <div className="flex items-center gap-3 border-b-2 border-line px-5 py-4">
          <h2 className="text-lg font-extrabold text-ink">{title}</h2>
          <button
            aria-label="Close"
            className="ml-auto flex size-8 items-center justify-center rounded-[10px] border-2 border-line bg-surface text-lg font-bold text-ink hover:bg-tint"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
