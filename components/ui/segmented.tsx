"use client";

import type { LucideIcon } from "lucide-react";
import type * as React from "react";
import { useId, useRef } from "react";

import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  /** Shown instead of `label` below sm. The accessible name stays `label`. */
  shortLabel?: string;
  count?: number;
  icon?: LucideIcon;
  /** Required in 'tabs' mode: the id of the tabpanel this tab controls. */
  panelId?: string;
};

type Common<T extends string> = {
  /** Names the group (legend or tablist label). */
  label: string;
  value: T;
  onChange: (value: T) => void;
  iconOnly?: boolean;
  className?: string;
};

/**
 * - 'radio' (default): one choice that filters a list. A fieldset of native
 *   radios.
 * - 'tabs': only when every option has a panelId. The tab id is
 *   `${panelId}-tab`; put `role="tabpanel" aria-labelledby` on the panel.
 */
export type SegmentedProps<T extends string> = Common<T> &
  (
    | { mode?: "radio"; options: SegmentedOption<T>[] }
    | {
        mode: "tabs";
        options: (SegmentedOption<T> & { panelId: string })[];
      }
  );

export const segmentTabId = (panelId: string) => `${panelId}-tab`;

const track =
  "grid auto-cols-fr grid-flow-col gap-1 rounded-[16px] border-2 border-[var(--line-strong)] bg-surface p-1";

const segment = (selected: boolean) =>
  cn(
    "flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-[10px] px-2 text-sm font-bold focus-visible:-outline-offset-3",
    selected
      ? "bg-ink text-surface forced-colors:outline forced-colors:outline-2"
      : "press-flat text-ink",
  );

const accessibleName = (option: SegmentedOption<string>) =>
  option.count != null ? `${option.label}, ${option.count}` : option.label;

function Content({
  option,
  iconOnly,
}: {
  option: SegmentedOption<string>;
  iconOnly?: boolean;
}) {
  const Icon = option.icon;
  return (
    <span aria-hidden className="flex min-w-0 items-center gap-1.5">
      {Icon && <Icon className="size-4 shrink-0" />}
      {!iconOnly &&
        (option.shortLabel ? (
          <>
            <span className="truncate sm:hidden">{option.shortLabel}</span>
            <span className="truncate max-sm:hidden">{option.label}</span>
          </>
        ) : (
          <span className="truncate">{option.label}</span>
        ))}
      {option.count != null && (
        <span className="tabular-nums opacity-80"> {option.count}</span>
      )}
    </span>
  );
}

export function Segmented<T extends string>(props: SegmentedProps<T>) {
  const { label, value, onChange, iconOnly, className } = props;
  const name = useId();
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  if (props.mode === "tabs") {
    const { options } = props;
    const onKeyDown = (event: React.KeyboardEvent, index: number) => {
      let next = -1;
      if (event.key === "ArrowRight") next = (index + 1) % options.length;
      else if (event.key === "ArrowLeft")
        next = (index - 1 + options.length) % options.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = options.length - 1;
      if (next < 0) return;
      event.preventDefault();
      const option = options[next];
      onChange(option.value);
      tabRefs.current.get(option.value)?.focus();
    };
    return (
      <div role="tablist" aria-label={label} className={cn(track, className)}>
        {options.map((option, index) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              ref={(el) => {
                if (el) tabRefs.current.set(option.value, el);
                else tabRefs.current.delete(option.value);
              }}
              type="button"
              role="tab"
              id={segmentTabId(option.panelId)}
              aria-selected={selected}
              aria-controls={option.panelId}
              aria-label={accessibleName(option)}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={segment(selected)}
            >
              <Content option={option} iconOnly={iconOnly} />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="sr-only">{label}</legend>
      <div className={track}>
        {props.options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                segment(selected),
                "cursor-pointer has-[:focus-visible]:outline-3 has-[:focus-visible]:-outline-offset-3 has-[:focus-visible]:outline-brand",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                aria-label={accessibleName(option)}
                className="sr-only"
              />
              <Content option={option} iconOnly={iconOnly} />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
