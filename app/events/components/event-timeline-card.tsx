"use client";

import Image from "next/image";
import Link from "next/link";
import { Activity, CalendarDays, Clock3, MapPin, Repeat } from "lucide-react";

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

export function EventTimelineCard({
  event,
  variant,
  nowTimestamp,
  displayButton = true,
}: {
  event: EventItem;
  variant: EventVariant;
  nowTimestamp?: number;
  displayButton?: boolean;
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
  const handleEventLinkClick = () => {
    if (typeof window === "undefined") {
      return;
    }
    if (window.location.pathname !== "/events") {
      return;
    }
    window.sessionStorage.setItem("events:scrollY", String(window.scrollY));
  };
  const wideCardBase =
    "grid h-full gap-2.5 overflow-hidden border-2 border-primary bg-white md:grid-cols-[260px_1fr]";
  const cardClass =
    variant === "past"
      ? "flex h-full flex-col gap-2.5 overflow-hidden border border-border bg-card"
      : wideCardBase;

  const widePosterBase =
    "relative h-full overflow-hidden rounded-l-[10px] rounded-r-none bg-muted";
  const posterClass =
    variant === "ongoing"
      ? `${widePosterBase} min-h-[182px]`
      : variant === "upcoming"
        ? `${widePosterBase} min-h-[190px]`
        : "relative h-[146px] overflow-hidden rounded-t-[10px] rounded-b-none bg-muted";

  return (
    <article className={`${cardClass} rounded-2xl`}>
      <div className={`${posterClass} ${!hasImage ? "bg-primary" : ""}`}>
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

      <div className="flex flex-1 flex-col p-3">
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
                : "text-[1.18rem] text-foreground/80"
          }`}
        >
          {event.title ?? "Untitled Event"}
        </h3>

        {event.description && (
          <p
            className={`mt-1 hidden overflow-hidden text-[0.92rem] leading-[1.45] text-muted-foreground min-[701px]:[display:-webkit-box] [-webkit-box-orient:vertical] ${
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
            <Button asChild className="max-w-full" size="sm" variant="link">
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
              {recurrenceLabel && (
                <Badge
                  className="w-fit"
                  icon={
                    <Repeat
                      aria-hidden="true"
                      className="h-3 w-3"
                      strokeWidth={2.25}
                    />
                  }
                  variant="blue"
                  size="sm"
                >
                  {recurrenceLabel}
                </Badge>
              )}
              <Badge
                className="w-fit"
                icon={
                  <CalendarDays
                    aria-hidden="true"
                    className="h-3 w-3"
                    strokeWidth={2.25}
                  />
                }
                variant="default"
                size="sm"
              >
                {formatEventDayBadge(event, displayStartTimestamp)}
              </Badge>
              <Badge
                className="w-fit"
                icon={
                  <Clock3
                    aria-hidden="true"
                    className="h-3 w-3"
                    strokeWidth={2.25}
                  />
                }
                variant="default"
                size="sm"
              >
                {formatEventTimeLabel(event, displayStartTimestamp)}
              </Badge>
              <Badge
                className="w-fit"
                icon={
                  <MapPin
                    aria-hidden="true"
                    className="h-3 w-3"
                    strokeWidth={2.25}
                  />
                }
                variant="default"
                size="sm"
              >
                {event.location || "Location TBD"}
              </Badge>
            </div>

            {displayButton && (
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
            )}
          </div>
        )}
      </div>
    </article>
  );
}
