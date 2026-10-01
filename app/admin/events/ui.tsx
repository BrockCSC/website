"use client";

import { Sheet, type SheetCloseReason } from "@/components/ui/sheet";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[10px] border-2 border-line px-4 py-2 text-sm font-bold disabled:pointer-events-none disabled:opacity-50";

// Shadowed buttons sink like Button's `hard` when pressed (spec D11).
const sink =
  "active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_0_var(--shade)]";

export const btn = {
  primary: `${base} bg-brand text-brand-ink shadow-brut-sm hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 ${sink}`,
  secondary: `${base} bg-surface text-ink shadow-brut-sm hover:-translate-y-0.5 hover:bg-tint motion-reduce:hover:translate-y-0 ${sink}`,
  danger: `${base} border-destructive bg-destructive text-surface shadow-brut-sm hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 ${sink}`,
  quiet: `${base} border-transparent px-2.5 py-2 text-destructive hover:bg-tint`,
};

// 16px on touch and phones, so iOS doesn't zoom into the field (spec D9).
export const field =
  "w-full rounded-[10px] border-2 border-line bg-surface px-3 py-2 text-base pointer-fine:text-sm font-medium text-ink outline-none [color-scheme:light] focus:bg-tint dark:[color-scheme:dark]";

export const errorText =
  "mt-1 animate-rise-in text-xs font-bold text-destructive";

/** Helper text under a field: 14px on touch, 12px with a mouse. */
export const helpText = "mt-1 text-sm pointer-fine:text-xs text-subtle";

/**
 * The event editor's frame: a full screen on a phone with a Cancel · title ·
 * action top bar (so Save never sits under the keyboard), and today's centred
 * 660px card with its × header on desk. Built on the shared <dialog> Sheet.
 */
export function EditorSheet({
  open,
  title,
  onClose,
  phoneAction,
  busy = false,
  onExited,
  children,
}: {
  open: boolean;
  title: string;
  onClose: (reason: SheetCloseReason) => void;
  /** The top bar's trailing slot on a phone (Create / Save). */
  phoneAction?: React.ReactNode;
  /** Saving or deleting: dismissals are ignored and a forced close re-opens. */
  busy?: boolean;
  onExited?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Sheet
      bare
      desktop="card"
      desktopClassName="desk:max-w-[660px] desk:max-h-[86vh]"
      dismissible={!busy}
      fitVisualViewport
      hideTitle
      initialFocus="title"
      onClose={onClose}
      onExited={onExited}
      open={open}
      presentation="full"
      title={title}
    >
      {/* Phone top bar. The sides share the spare width, so the title stays
          centred until it has to truncate. */}
      <div className="flex min-h-14 shrink-0 items-center gap-2 border-b-2 border-line bg-surface pt-[env(safe-area-inset-top)] pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.5rem,env(safe-area-inset-left))] desk:hidden">
        <div className="flex flex-1 basis-0 justify-start">
          <button
            aria-disabled={busy || undefined}
            className="press-flat min-h-11 rounded-[10px] px-3 font-bold text-ink aria-disabled:opacity-50"
            onClick={() => onClose("close-button")}
            type="button"
          >
            Cancel
          </button>
        </div>
        <p
          aria-hidden
          className="min-w-0 shrink truncate text-center text-base font-extrabold text-ink"
        >
          {title}
        </p>
        <div className="flex flex-1 basis-0 justify-end">{phoneAction}</div>
      </div>

      {/* Desk header, as before. The sr-only <h2> names the dialog. */}
      <div className="flex items-center gap-3 border-b-2 border-line px-5 pt-4 pb-4 phone:hidden">
        <p aria-hidden className="text-lg font-extrabold text-ink">
          {title}
        </p>
        <button
          aria-label="Close"
          className="ml-auto flex size-8 items-center justify-center rounded-[10px] border-2 border-line bg-surface text-lg font-bold text-ink hover:bg-tint pointer-coarse:size-11"
          disabled={busy}
          onClick={() => onClose("close-button")}
          type="button"
        >
          ×
        </button>
      </div>
      {children}
    </Sheet>
  );
}
