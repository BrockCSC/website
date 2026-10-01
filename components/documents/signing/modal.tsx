"use client";

import { Sheet, type SheetProps } from "@/components/ui/sheet";

/**
 * The signing flow's dialog: the shared <dialog> Sheet, a bottom sheet on
 * phones and a centred card on desk. Consumers mount it while it's open.
 * On phones the footer's buttons form a 48px two-column grid.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  footerNote,
  size = "md",
  dismissible = true,
  presentation,
  initialFocus,
  open = true,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** A status line above the footer buttons (e.g. why the primary is off). */
  footerNote?: React.ReactNode;
  size?: "md" | "lg";
  /** false while busy: Esc and the backdrop do nothing, and a forced close re-opens. */
  dismissible?: boolean;
  presentation?: SheetProps["presentation"];
  initialFocus?: SheetProps["initialFocus"];
  open?: boolean;
}) {
  return (
    <Sheet
      desktopClassName={size === "lg" ? "desk:max-w-2xl" : "desk:max-w-md"}
      dismissible={dismissible}
      footer={
        footer && (
          <>
            {footerNote}
            <div className="grid grid-cols-2 gap-3 desk:flex desk:flex-wrap desk:items-center desk:justify-end phone:[&>button]:h-12">
              {footer}
            </div>
          </>
        )
      }
      initialFocus={initialFocus}
      onClose={() => onClose()}
      open={open}
      presentation={presentation}
      title={title}
    >
      {children}
    </Sheet>
  );
}
