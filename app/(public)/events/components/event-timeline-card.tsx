"use client";

import Image from "next/image";
import Link from "next/link";
import { Activity, CalendarDays, Clock3, MapPin, Repeat } from "lucide-react";
import type * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EventRecord, WithKey } from "@/lib/api";
import {
  formatEventDayBadge,
  formatEventTimeLabel,
  getEventStartTimestamp,
  getEventTiming,
  getRecurrenceLabel,
} from "@/lib/events/schedule";
import { cn } from "@/lib/utils";

type EventItem = WithKey<EventRecord>;

export type EventVariant = "ongoing" | "upcoming" | "past";

const EMPTY_IMAGE = "/logo-black.svg";

const formatStartsInLabel = (millisecondsUntilStart: number): string => {
  if (millisecondsUntilStart <= 0) {
    return "Starting soon";
  }

  const totalMinutes = Math.ceil(millisecondsUntilStart / 60000);
  if (totalMinutes < 60) {
    return `Starting in ${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) {
    return `Starting in ${hours}h`;
  }

  return `Starting in ${hours}h ${minutes}m`;
};

const getTorontoDateKey = (timestamp: number): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));

const getTodayStartLabel = (
  nowTimestamp: number,
  displayTimestamp: number | null,
): string | null => {
  if (typeof displayTimestamp !== "number") {
    return null;
  }

  if (getTorontoDateKey(nowTimestamp) !== getTorontoDateKey(displayTimestamp)) {
    return null;
  }

  return formatStartsInLabel(displayTimestamp - nowTimestamp);
};

/**
 * Remembers the list scroll position, and that the detail page was opened
 * from the list, so its Back can be a real history back (public-7).
 */
const handleEventLinkClick = (
  clickEvent: React.MouseEvent<HTMLAnchorElement>,
) => {
  if (typeof window === "undefined") {
    return;
  }
  if (window.location.pathname !== "/events") {
    return;
  }
  try {
    window.sessionStorage.setItem("events:scrollY", String(window.scrollY));
    // The detail page's path, so a later visit from elsewhere doesn't match.
    window.sessionStorage.setItem(
      "events:fromList",
      new URL(clickEvent.currentTarget.href).pathname,
    );
  } catch {
    // Storage blocked: Back falls back to a plain link.
  }
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Tomorrow" / "This week" for the phone rows; today has its own label. */
const getSoonLabel = (
  nowTimestamp: number,
  displayTimestamp: number | null,
): string | null => {
  if (typeof displayTimestamp !== "number" || displayTimestamp < nowTimestamp) {
    return null;
  }
  if (
    getTorontoDateKey(nowTimestamp + DAY_MS) ===
    getTorontoDateKey(displayTimestamp)
  ) {
    return "Tomorrow";
  }
  return displayTimestamp - nowTimestamp < 7 * DAY_MS ? "This week" : null;
};

const getDisplayStart = (
  event: EventItem,
  variant: EventVariant,
  nowTimestamp?: number,
): number | null => {
  const base = getEventStartTimestamp(event);
  if (variant !== "upcoming" || typeof nowTimestamp !== "number") {
    return base;
  }
  return getEventTiming(event, nowTimestamp).nextStartTimestamp ?? base;
};

const getRowFlag = (
  variant: EventVariant,
  nowTimestamp: number | undefined,
  displayStart: number | null,
): { label: string; tone: "destructive" | "blue" } | null => {
  if (variant === "ongoing") {
    return { label: "Live now", tone: "destructive" };
  }
  if (variant !== "upcoming" || typeof nowTimestamp !== "number") {
    return null;
  }
  const label =
    getTodayStartLabel(nowTimestamp, displayStart) ??
    getSoonLabel(nowTimestamp, displayStart);
  return label ? { label, tone: "blue" } : null;
};

/**
 * Below md: one compact row per event (public-18), the whole row a link
 * (public-3). Rendered inside an EventRowList.
 */
export function EventRow({
  event,
  variant,
  nowTimestamp,
}: {
  event: EventItem;
  variant: EventVariant;
  nowTimestamp?: number;
}) {
  const hasImage = Boolean(event.image?.url);
  const displayStart = getDisplayStart(event, variant, nowTimestamp);
  const meta = [
    formatEventDayBadge(event, displayStart),
    formatEventTimeLabel(event, displayStart).replace(" - ", "–"),
    event.location,
  ]
    .filter(Boolean)
    .join(" · ");
  const flag = getRowFlag(variant, nowTimestamp, displayStart);

  return (
    <li>
      <Link
        className="press-flat flex min-h-24 items-center gap-3 px-3 py-2 text-ink"
        href={`/events/${event.$key}`}
        onClick={handleEventLinkClick}
      >
        <div
          className={cn(
            "relative h-24 w-[72px] shrink-0 overflow-hidden rounded-[10px] border-2 border-line",
            hasImage ? "bg-raised" : "bg-brand",
          )}
        >
          <Image
            alt=""
            className={cn(
              hasImage
                ? "object-cover"
                : "object-contain p-3 brightness-0 invert",
              variant === "past" &&
                hasImage &&
                "grayscale-[0.2] saturate-[0.75]",
            )}
            fill
            sizes="72px"
            src={event.image?.url || EMPTY_IMAGE}
            unoptimized
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {flag && (
            <Badge
              className="w-fit max-w-full text-xs"
              size="sm"
              variant={flag.tone}
            >
              <span className="min-w-0 truncate">{flag.label}</span>
            </Badge>
          )}
          <h3
            className={cn(
              "line-clamp-2 text-[17px] leading-snug font-semibold",
              variant === "past" && "text-ink/80",
            )}
          >
            {event.title ?? "Untitled Event"}
          </h3>
          <p className="truncate text-sm text-subtle">{meta}</p>
        </div>
      </Link>
    </li>
  );
}

/** The grouped container for EventRows (below md). */
export function EventRowList({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <ul
      className={cn(
        "divide-y-2 divide-line/15 overflow-hidden rounded-[16px] border-2 border-line bg-surface",
        className,
      )}
    >
      {children}
    </ul>
  );
}

export function EventTimelineCard({
  event,
  variant,
  nowTimestamp,
}: {
  event: EventItem;
  variant: EventVariant;
  nowTimestamp?: number;
}) {
  const hasImage = Boolean(event.image?.url);
  const imageSrc = event.image?.url || EMPTY_IMAGE;
  const timing =
    typeof nowTimestamp === "number"
      ? getEventTiming(event, nowTimestamp)
      : null;
  const baseStartTimestamp = getEventStartTimestamp(event);
  const displayStartTimestamp =
    variant === "upcoming"
      ? (timing?.nextStartTimestamp ?? baseStartTimestamp)
      : baseStartTimestamp;
  const todayStartLabel =
    variant === "upcoming" && typeof nowTimestamp === "number"
      ? getTodayStartLabel(nowTimestamp, displayStartTimestamp)
      : null;
  const recurrenceLabel =
    variant === "upcoming" ? getRecurrenceLabel(event) : null;
  const badges = [
    ...(recurrenceLabel
      ? [{ Icon: Repeat, label: recurrenceLabel, variant: "blue" as const }]
      : []),
    {
      Icon: CalendarDays,
      label: formatEventDayBadge(event, displayStartTimestamp),
      variant: "default" as const,
    },
    {
      Icon: Clock3,
      label: formatEventTimeLabel(event, displayStartTimestamp),
      variant: "default" as const,
    },
    {
      Icon: MapPin,
      label: event.location || "Location TBD",
      variant: "default" as const,
    },
  ];
  const wideCardBase =
    "grid h-full grid-cols-[minmax(0,1fr)] gap-2.5 overflow-hidden border-2 border-brand bg-surface md:grid-cols-[260px_minmax(0,1fr)]";
  const cardClass =
    variant === "past"
      ? "flex h-full flex-col gap-2.5 overflow-hidden border border-line/25 bg-raised"
      : wideCardBase;

  const widePosterBase =
    "relative h-full overflow-hidden rounded-t-[10px] md:rounded-l-[10px] md:rounded-tr-none bg-raised";
  const posterClass =
    variant === "ongoing"
      ? `${widePosterBase} min-h-[182px]`
      : variant === "upcoming"
        ? `${widePosterBase} min-h-[190px]`
        : "relative h-[146px] overflow-hidden rounded-t-[10px] rounded-b-none bg-raised";

  return (
    <article className={`${cardClass} rounded-2xl`}>
      <div className={`${posterClass} ${!hasImage ? "bg-brand" : ""}`}>
        {hasImage && (
          <div
            className={`absolute -inset-2 bg-cover bg-center blur-[10px] ${
              variant === "past"
                ? "brightness-[0.9] saturate-[0.7]"
                : "brightness-75"
            }`}
            style={{ backgroundImage: `url(${imageSrc})` }}
          />
        )}
        <Image
          alt={event.title ?? "Event poster"}
          className={`absolute inset-0 z-1 object-contain ${
            hasImage ? "p-1.5" : "p-4 brightness-0 invert"
          } ${variant === "past" ? "grayscale-[0.2] saturate-[0.75]" : ""}`}
          fill
          sizes={
            variant === "past"
              ? "(max-width: 700px) 100vw, 33vw"
              : "(max-width: 768px) 100vw, 50vw"
          }
          src={imageSrc}
          unoptimized
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-3">
        {variant === "ongoing" && (
          <Badge
            className="mb-2 w-fit"
            icon={
              <Activity
                aria-hidden="true"
                className="h-3 w-3"
                strokeWidth={2.25}
              />
            }
            variant="destructive"
            size="sm"
          >
            Live Now
          </Badge>
        )}
        {todayStartLabel && (
          <Badge
            className="mb-2 w-fit"
            icon={
              <Clock3
                aria-hidden="true"
                className="h-3 w-3"
                strokeWidth={2.25}
              />
            }
            size="sm"
            variant="blue"
          >
            {todayStartLabel}
          </Badge>
        )}

        <h3
          className={`m-0 leading-[1.14] ${
            variant === "ongoing"
              ? "text-[1.45rem]"
              : variant === "upcoming"
                ? "text-[1.45rem]"
                : "text-[1.18rem] text-ink/80"
          }`}
        >
          {event.title ?? "Untitled Event"}
        </h3>

        {event.description && (
          <p
            className={`mt-1 hidden overflow-hidden text-[0.92rem] leading-[1.45] text-subtle min-[701px]:[display:-webkit-box] [-webkit-box-orient:vertical] ${
              variant === "past"
                ? "[-webkit-line-clamp:2]"
                : "[-webkit-line-clamp:3]"
            }`}
          >
            {event.description}
          </p>
        )}

        {variant === "past" ? (
          <div className="mt-auto">
            <Button
              asChild
              className="max-w-full pointer-coarse:!min-h-11"
              size="sm"
              variant="link"
            >
              <Link
                href={`/events/${event.$key}`}
                onClick={handleEventLinkClick}
              >
                View Recap
              </Link>
            </Button>
          </div>
        ) : (
          <div className={`${variant === "upcoming" ? "mt-auto" : ""}`}>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {badges.map(({ Icon, label, variant }) => (
                <Badge
                  className="w-fit max-w-full"
                  icon={
                    <Icon
                      aria-hidden="true"
                      className="h-3 w-3"
                      strokeWidth={2.25}
                    />
                  }
                  key={label}
                  size="sm"
                  variant={variant}
                >
                  <span className="min-w-0 truncate">{label}</span>
                </Badge>
              ))}
            </div>

            <div
              className={
                variant === "upcoming"
                  ? "mt-2.5"
                  : variant === "ongoing"
                    ? "mt-auto pt-2"
                    : "mt-auto pt-0 max-[700px]:pt-2"
              }
            >
              <Button
                asChild
                className="w-full max-w-full"
                size="sm"
                variant="primary"
              >
                <Link
                  href={`/events/${event.$key}`}
                  onClick={handleEventLinkClick}
                >
                  {variant === "ongoing" ? "Happening Now" : "Learn More"}
                </Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
