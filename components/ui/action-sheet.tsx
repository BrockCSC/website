"use client";

import type { LucideIcon } from "lucide-react";
import type * as React from "react";

import { Sheet, type SheetCloseReason } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type ActionSheetAction = {
  key: string;
  label: string;
  icon?: LucideIcon;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

type ActionSheetProps = {
  open: boolean;
  /** 'select' when a row was chosen; the row's onSelect runs right after. */
  onClose: (reason: SheetCloseReason | "select") => void;
  /** Names the dialog; shown as the small caption. */
  title: string;
  message?: React.ReactNode;
  actions: ActionSheetAction[];
  cancelLabel?: string;
};

const row =
  "press-flat flex min-h-13 w-full items-center gap-3 px-4 text-left text-base font-bold disabled:cursor-default disabled:opacity-40";

function ActionRow({
  action,
  onPick,
}: {
  action: ActionSheetAction;
  onPick: (action: ActionSheetAction) => void;
}) {
  const Icon = action.icon;
  return (
    <li>
      <button
        type="button"
        disabled={action.disabled}
        onClick={() => onPick(action)}
        className={cn(
          row,
          action.destructive ? "text-destructive" : "text-ink",
        )}
      >
        {Icon && <Icon aria-hidden className="size-5 shrink-0" />}
        <span className="min-w-0 flex-1 truncate">{action.label}</span>
      </button>
    </li>
  );
}

/**
 * A short list of choices on a bottom sheet (phone) or a small centred card
 * (desk). Destructive actions form their own group at the end.
 */
export function ActionSheet({
  open,
  onClose,
  title,
  message,
  actions,
  cancelLabel = "Cancel",
}: ActionSheetProps) {
  const regular = actions.filter((action) => !action.destructive);
  const destructive = actions.filter((action) => action.destructive);

  const pick = (action: ActionSheetAction) => {
    onClose("select");
    action.onSelect();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={message}
      presentation="action"
      desktopClassName="desk:max-w-[22rem]"
    >
      {regular.length > 0 && (
        <ul className="divide-y-2 divide-line/15">
          {regular.map((action) => (
            <ActionRow key={action.key} action={action} onPick={pick} />
          ))}
        </ul>
      )}
      {destructive.length > 0 && (
        <ul
          className={cn(
            "divide-y-2 divide-line/15",
            regular.length > 0 && "border-t-2 border-line",
          )}
        >
          {destructive.map((action) => (
            <ActionRow key={action.key} action={action} onPick={pick} />
          ))}
        </ul>
      )}
      <div className="px-4 pt-3 pb-4">
        <button
          type="button"
          data-autofocus
          onClick={() => onClose("close-button")}
          className="press-flat flex min-h-13 w-full items-center justify-center rounded-[16px] border-2 border-line text-base font-bold text-ink"
        >
          {cancelLabel}
        </button>
      </div>
    </Sheet>
  );
}
