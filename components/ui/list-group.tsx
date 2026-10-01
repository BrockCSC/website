"use client";

import { ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { useId } from "react";

import { cn } from "@/lib/utils";

/** Grouped rows (settings-style). No shadow at any width: it's a container. */
export function ListGroup({
  header,
  footer,
  className,
  children,
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const headerId = useId();
  return (
    <section className={cn("min-w-0", className)}>
      {header != null && (
        <div
          id={headerId}
          className="px-1 pb-1.5 text-xs font-bold tracking-wide text-subtle uppercase"
        >
          {header}
        </div>
      )}
      <ul
        aria-labelledby={header != null ? headerId : undefined}
        className="divide-y-2 divide-line/15 overflow-hidden rounded-[16px] border-2 border-line bg-surface"
      >
        {children}
      </ul>
      {footer != null && (
        <div className="px-1 pt-1.5 text-xs text-subtle">{footer}</div>
      )}
    </section>
  );
}

type RowBase = {
  icon?: React.ReactNode;
  title: React.ReactNode;
  detail?: React.ReactNode;
  /** Trailing value text, e.g. "Dark". */
  value?: React.ReactNode;
  destructive?: boolean;
  /** Unread count; hidden when 0. */
  badge?: number;
};

type Never<T> = { [K in keyof T]?: never };

type LinkRow = { href: string; external?: boolean };
type ButtonRow = { onPress: () => void };
type SwitchRow = {
  switchProps: {
    checked: boolean;
    onChange(value: boolean): void;
    disabled?: boolean;
  };
};
type StaticRow = { accessory?: React.ReactNode };

/** Exactly one of href / onPress / switchProps / accessory. */
export type ListRowProps = RowBase &
  (
    | (LinkRow & Never<ButtonRow & SwitchRow & StaticRow>)
    | (ButtonRow & Never<LinkRow & SwitchRow & StaticRow>)
    | (SwitchRow & Never<LinkRow & ButtonRow & StaticRow>)
    | (StaticRow & Never<LinkRow & ButtonRow & SwitchRow>)
  );

const rowClass = "flex min-h-13 w-full items-center gap-3 px-4 py-2.5";

function RowBody({
  icon,
  title,
  detail,
  value,
  badge,
}: Pick<RowBase, "icon" | "title" | "detail" | "value" | "badge">) {
  return (
    <>
      {icon != null && (
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-[10px] border-2 border-line [&_svg]:size-5"
        >
          {icon}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="font-bold">{title}</span>
        {detail != null && (
          <span className="truncate text-sm text-subtle">{detail}</span>
        )}
      </span>
      {value != null && (
        <span className="shrink-0 text-sm text-subtle">{value}</span>
      )}
      {badge != null && badge > 0 && (
        <>
          <span
            aria-hidden
            className="min-w-5 shrink-0 rounded-full border-2 border-line bg-brand px-1 text-center text-[11px] leading-4 font-bold text-brand-ink forced-colors:border-[CanvasText]"
          >
            {badge}
          </span>
          <span className="sr-only">, {badge} unread</span>
        </>
      )}
    </>
  );
}

export function ListRow(props: ListRowProps) {
  const { destructive } = props;
  const tone = destructive ? "text-destructive" : "text-ink";
  const body = <RowBody {...props} />;

  if (props.href != null) {
    const Glyph = props.external ? ExternalLink : ChevronRight;
    const glyph = <Glyph aria-hidden className="size-5 shrink-0 text-subtle" />;
    return (
      <li>
        {props.external ? (
          <a
            href={props.href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(rowClass, "press-flat", tone)}
          >
            {body}
            <span className="sr-only"> (opens in a new tab)</span>
            {glyph}
          </a>
        ) : (
          <Link href={props.href} className={cn(rowClass, "press-flat", tone)}>
            {body}
            {glyph}
          </Link>
        )}
      </li>
    );
  }

  if (props.onPress != null) {
    return (
      <li>
        <button
          type="button"
          onClick={props.onPress}
          className={cn(rowClass, "press-flat", tone)}
        >
          {body}
          <ChevronRight aria-hidden className="size-5 shrink-0 text-subtle" />
        </button>
      </li>
    );
  }

  if (props.switchProps != null) {
    const { checked, onChange, disabled } = props.switchProps;
    return (
      <li>
        <label
          className={cn(
            rowClass,
            tone,
            disabled
              ? "cursor-default opacity-60"
              : "press-flat cursor-pointer",
          )}
        >
          {body}
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={checked}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
          />
        </label>
      </li>
    );
  }

  return (
    <li className={cn(rowClass, tone)}>
      {body}
      {props.accessory}
    </li>
  );
}
