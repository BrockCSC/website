"use client";

import Image from "next/image";
import Link from "next/link";
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  Clock3,
  Link2,
  MapPin,
  Share,
  User,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import type * as React from "react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListGroup, ListRow } from "@/components/ui/list-group";
import { toast } from "@/components/ui/toast";
import { fetchEventById, type EventRecord, type WithKey } from "@/lib/api";
import {
  downloadEventIcs,
  eventIcsHref,
  googleCalendarUrl,
} from "@/lib/events/ics";
import {
  formatEventDateLabel,
  formatEventTimeLabel,
  getEventTiming,
  getEventStartTimestamp,
  getRecurrenceLabel,
} from "@/lib/events/schedule";
import { COARSE_QUERY } from "@/lib/media-queries";
import { cn } from "@/lib/utils";

type EventItem = WithKey<EventRecord>;

const EMPTY_IMAGE = "/logo-black.svg";
const NOT_FOUND_MESSAGE = "Event not found.";

// Full-bleed inside the public container, whose gutters include the
// landscape safe areas (the bar shows up to 900px, so landscape phones too).
const bleed =
  "-mr-[max(1.25rem,env(safe-area-inset-right))] -ml-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pl-[max(1.25rem,env(safe-area-inset-left))]";

type Platform = {
  ios: boolean;
  android: boolean;
  coarse: boolean;
  canShare: boolean;
};

const SERVER_PLATFORM: Platform = {
  ios: false,
  android: false,
  coarse: false,
  canShare: false,
};
let clientPlatform: Platform | null = null;

const readPlatform = (): Platform => {
  if (!clientPlatform) {
    const ua = navigator.userAgent;
    clientPlatform = {
      // iPadOS reports a Mac UA; touch points tell them apart.
      ios:
        /iPad|iPhone|iPod/.test(ua) ||
        (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1),
      android: /Android/i.test(ua),
      coarse: window.matchMedia(COARSE_QUERY).matches,
      canShare: typeof navigator.share === "function",
    };
  }
  return clientPlatform;
};

const noSubscribe = () => () => {};

/** UA and pointer facts that decide which links the calendar and maps use. */
const usePlatform = () =>
  useSyncExternalStore(noSubscribe, readPlatform, () => SERVER_PLATFORM);

const mapsUrl = (location: string, ios: boolean) =>
  ios
    ? `https://maps.apple.com/?q=${encodeURIComponent(location)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;

const getAction = (
  event: EventItem,
  isPastEvent: boolean,
): { href: string; label: string } | null => {
  if (!isPastEvent && event.signupUrl) {
    return { href: event.signupUrl, label: "Register Now" };
  }
  if (!isPastEvent && event.googleFormUrl) {
    return { href: event.googleFormUrl, label: "Register Now" };
  }
  if (event.gallery?.[0]?.url) {
    return { href: event.gallery[0].url, label: "View Gallery" };
  }
  if (event.resources?.[0]?.url) {
    return { href: event.resources[0].url, label: "Open Resource" };
  }
  return null;
};

/**
 * Add to Calendar, per platform (public-missed-1): Android opens Google
 * Calendar's template (Chrome would only download an .ics), other touch
 * devices follow a real text/calendar link (iOS hands it to Calendar), and
 * fine pointers keep the blob download.
 */
function CalendarControl({
  event,
  start,
  platform,
  className,
  variant,
  size,
  iconOnly = false,
}: {
  event: EventItem;
  start: number;
  platform: Platform;
  className?: string;
  variant: "primary" | "outline";
  size?: "default" | "lg";
  iconOnly?: boolean;
}) {
  const label = "Add to Calendar";
  const content = iconOnly ? (
    <CalendarPlus aria-hidden="true" className="size-5" />
  ) : (
    <>
      <CalendarPlus aria-hidden="true" />
      {label}
    </>
  );
  const common = {
    "aria-label": iconOnly ? label : undefined,
    className,
    size,
    variant,
  };

  if (platform.android) {
    const eventUrl = `${window.location.origin}/events/${event.$key}`;
    return (
      <Button asChild {...common}>
        <a
          href={googleCalendarUrl(event, start, eventUrl)}
          rel="noopener noreferrer"
          target="_blank"
        >
          {content}
        </a>
      </Button>
    );
  }
  if (platform.coarse) {
    return (
      <Button asChild {...common}>
        <a href={eventIcsHref(event, start)}>{content}</a>
      </Button>
    );
  }
  return (
    <Button onClick={() => downloadEventIcs(event, start)} {...common}>
      {content}
    </Button>
  );
}

const factTitle = (label: string, value: React.ReactNode) => (
  <>
    <span className="sr-only">{label}: </span>
    {value}
  </>
);

export default function EventDetailPageClient() {
  const params = useParams<{ eventId: string }>();
  const eventId = params.eventId;
  const router = useRouter();
  const platform = usePlatform();

  const [event, setEvent] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const [reloadCount, setReloadCount] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchEventById(eventId);
        if (!active) {
          return;
        }
        if (!data) {
          setError(NOT_FOUND_MESSAGE);
          setEvent(null);
          return;
        }
        setEvent(data);
      } catch {
        if (!active) {
          return;
        }
        setError("Could not load this event.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    if (eventId) {
      void load();
    }

    return () => {
      active = false;
    };
  }, [eventId, reloadCount]);

  const recurrenceLabel = useMemo(
    () => (event ? getRecurrenceLabel(event) : null),
    [event],
  );
  const timing = useMemo(
    () => (event ? getEventTiming(event, now) : null),
    [event, now],
  );
  const isPastEvent = timing
    ? !timing.isOngoing && timing.nextStartTimestamp === null
    : false;
  const eventStartTimestamp = useMemo(
    () => (event ? getEventStartTimestamp(event) : null),
    [event],
  );
  const calendarStartTimestamp =
    timing?.nextStartTimestamp ?? eventStartTimestamp;

  const copyLink = async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      return true;
    } catch {
      return false;
    }
  };
  const copyLinkInline = async () => {
    const copied = await copyLink();
    setLinkCopied(copied);
    if (copied) {
      window.setTimeout(() => setLinkCopied(false), 2000);
    }
  };
  const copyLinkWithToast = async () => {
    if (await copyLink()) {
      toast({ message: "Link copied" });
    } else {
      toast({ message: "Couldn't copy the link", tone: "error" });
    }
  };
  // Touch devices get the system share sheet (public-17). share() has to run
  // synchronously in the tap, so nothing is awaited before it.
  const useShareSheet = platform.coarse && platform.canShare;
  const shareEvent = (fallback: () => Promise<void>) => {
    if (!useShareSheet || !event) {
      void fallback();
      return;
    }
    navigator
      .share({
        title: event.title ?? "BrockCSC event",
        text: event.title ?? undefined,
        url: window.location.href,
      })
      .catch((shareError: unknown) => {
        if (
          shareError instanceof DOMException &&
          shareError.name === "AbortError"
        ) {
          return;
        }
        void copyLinkWithToast();
      });
  };

  // Back is a real history back when the list opened this page (public-7),
  // so the list keeps its place and no extra entry piles up.
  const handleBack = (clickEvent: React.MouseEvent<HTMLAnchorElement>) => {
    let fromList = false;
    try {
      fromList =
        window.sessionStorage.getItem("events:fromList") ===
        window.location.pathname;
      window.sessionStorage.removeItem("events:fromList");
    } catch {
      fromList = false;
    }
    if (fromList && window.history.length > 1) {
      clickEvent.preventDefault();
      router.back();
    }
  };

  const action = useMemo(
    () => (event ? getAction(event, isPastEvent) : null),
    [event, isPastEvent],
  );
  const hasRegistrationLink = Boolean(event?.signupUrl || event?.googleFormUrl);
  const hasImage = Boolean(event?.image?.url);
  const imageSrc = event?.image?.url || EMPTY_IMAGE;
  const infoCards = useMemo(
    () => [
      {
        label: "Date",
        value: event
          ? formatEventDateLabel(event, eventStartTimestamp)
          : "Date TBD",
      },
      {
        label: "Time",
        value: event
          ? formatEventTimeLabel(event, eventStartTimestamp)
          : "Time TBD",
      },
      {
        label: "Location",
        value: event?.location || "TBA",
      },
      {
        label: "Presenter",
        value: event?.presenter || "TBA",
      },
    ],
    [event, eventStartTimestamp],
  );
  const calendarStart = isPastEvent ? null : calendarStartTimestamp;
  // Below 901px the actions live in a sticky bottom bar (public-2); pb-1
  // leaves room for the footer's brand edge under it at the end. Past
  // events with no recap, gallery or resource get no bar.
  const showBar = Boolean(event) && (Boolean(action) || calendarStart !== null);

  return (
    <main
      className={cn(
        "min-h-screen bg-surface pt-6 pb-16 text-ink max-[900px]:flex max-[900px]:flex-col max-[900px]:pt-2",
        !loading && !error && showBar && "max-[900px]:pb-1",
      )}
    >
      {/* flex-1 below 901px: the bar after it sits at the bottom of a page
          shorter than the screen too. */}
      <div className="max-[900px]:flex-1">
        <Link
          className="-ml-2 inline-flex h-11 items-center gap-1 rounded-[10px] px-2 font-semibold text-ink active:bg-tint min-[901px]:hidden"
          href="/events"
          onClick={handleBack}
        >
          <ChevronLeft
            aria-hidden="true"
            className="size-5"
            strokeWidth={2.5}
          />
          <span>
            <span className="sr-only">Back to </span>Events
          </span>
        </Link>
        <Button
          asChild
          className="h-auto p-0 text-[0.92rem] font-semibold text-subtle max-[900px]:hidden"
          variant="link"
        >
          <Link href="/events" onClick={handleBack}>
            <ChevronLeft
              aria-hidden="true"
              className="mr-1 inline-block h-3.5 w-3.5 align-[-1px]"
            />
            Back to Events
          </Link>
        </Button>

        {loading && (
          <div
            aria-busy="true"
            aria-label="Loading event"
            className="mt-4 grid items-start gap-8 max-[900px]:mt-2 max-[900px]:gap-6 min-[901px]:grid-cols-[320px_1fr]"
            role="status"
          >
            <div className="mx-auto aspect-[3/4] w-full max-w-[320px] animate-pulse rounded-[18px] border-2 border-line bg-raised max-[900px]:aspect-[4/3] max-[900px]:max-h-[42svh] min-[901px]:max-w-none" />
            <div className="space-y-4">
              <div className="h-10 w-3/4 animate-pulse rounded-[10px] bg-raised" />
              <div className="h-20 animate-pulse rounded-[10px] bg-raised" />
              <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                {[0, 1, 2, 3].map((index) => (
                  <div
                    className="h-20 animate-pulse rounded-[10px] bg-raised"
                    key={index}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        {error && (
          <div className="mt-6 rounded-[16px] border-2 border-dashed border-line/25 px-4 py-8 text-center">
            <p className="m-0 text-subtle">{error}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              {error !== NOT_FOUND_MESSAGE && (
                <Button
                  onClick={() => setReloadCount((count) => count + 1)}
                  variant="outline"
                >
                  Try again
                </Button>
              )}
              <Button asChild variant="primary">
                <Link href="/events">Browse all events</Link>
              </Button>
            </div>
          </div>
        )}

        {!loading && !error && event && (
          <section className="animate-fade-in mt-4 grid items-start gap-8 max-[900px]:mt-2 max-[900px]:gap-6 min-[901px]:grid-cols-[320px_1fr]">
            <div className="brand-shadow-lg relative mx-auto aspect-[3/4] w-full max-w-[320px] overflow-hidden rounded-[18px] border-2 border-line bg-raised max-[900px]:aspect-[4/3] max-[900px]:max-h-[42svh] min-[901px]:max-w-none">
              {hasImage && (
                <div
                  className="absolute -inset-4 bg-cover bg-center blur-[14px] brightness-75"
                  style={{ backgroundImage: `url(${imageSrc})` }}
                />
              )}
              <Image
                alt={event.title ?? "Event poster"}
                className={`relative z-[1] object-contain ${hasImage ? "p-3" : "bg-brand p-7"}`}
                fill
                sizes="(min-width: 901px) 320px, 100vw"
                src={imageSrc}
                unoptimized
              />
            </div>

            <div>
              {event.dscEvent && (
                <div className="mb-4 flex flex-wrap gap-2">
                  <Badge className="max-md:text-xs" variant="default">
                    DSC Event
                  </Badge>
                  {recurrenceLabel && (
                    <Badge className="max-md:text-xs" variant="blue">
                      {recurrenceLabel}
                    </Badge>
                  )}
                </div>
              )}

              <h1 className="m-0 font-semibold text-[clamp(2rem,4vw,3.35rem)] leading-[1.02]">
                {event.title ?? "Untitled Event"}
              </h1>

              {/* Below 901px the facts come first, as one grouped list. */}
              <ListGroup className="mt-5 min-[901px]:hidden">
                <ListRow
                  accessory={null}
                  icon={<CalendarDays />}
                  title={factTitle("Date", infoCards[0].value)}
                />
                <ListRow
                  accessory={null}
                  icon={<Clock3 />}
                  title={factTitle("Time", infoCards[1].value)}
                />
                {event.location ? (
                  <ListRow
                    external
                    href={mapsUrl(event.location, platform.ios)}
                    icon={<MapPin />}
                    title={factTitle("Location", event.location)}
                  />
                ) : (
                  <ListRow
                    accessory={null}
                    icon={<MapPin />}
                    title={factTitle("Location", "TBA")}
                  />
                )}
                <ListRow
                  accessory={null}
                  icon={<User />}
                  title={factTitle("Presenter", infoCards[3].value)}
                />
                {platform.android && calendarStart !== null && (
                  <ListRow
                    external
                    href={eventIcsHref(event, calendarStart)}
                    icon={<CalendarPlus />}
                    title="Other calendar app"
                  />
                )}
              </ListGroup>

              <p className="mt-4 max-w-[62ch] border-l-4 border-line/25 pl-4 leading-[1.55] text-subtle max-[900px]:mt-6">
                {event.description ?? "More details coming soon."}
              </p>

              <div className="mt-6 hidden grid-cols-1 gap-3 min-[420px]:grid-cols-2 min-[901px]:grid">
                {infoCards.map((card) => (
                  <article className="detail-info-card" key={card.label}>
                    <h3 className="m-0 text-[0.8rem] uppercase tracking-[0.08em] text-subtle">
                      {card.label}
                    </h3>
                    <p className="mt-1.5 text-base font-bold text-ink">
                      {card.value}
                    </p>
                  </article>
                ))}
              </div>

              <div className="mt-6 hidden flex-wrap gap-3 min-[901px]:flex">
                {action ? (
                  <Button
                    asChild
                    className="max-w-full"
                    size="default"
                    variant="primary"
                  >
                    <Link
                      href={action.href}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {action.label}
                    </Link>
                  </Button>
                ) : null}

                {isPastEvent && !action && hasRegistrationLink ? (
                  <Button
                    className="max-w-full"
                    disabled
                    size="default"
                    variant="secondary"
                  >
                    Event Ended
                  </Button>
                ) : null}

                {calendarStart !== null ? (
                  <CalendarControl
                    event={event}
                    platform={platform}
                    start={calendarStart}
                    variant={action ? "outline" : "primary"}
                  />
                ) : null}

                <Button
                  onClick={() => shareEvent(copyLinkInline)}
                  variant="outline"
                >
                  {useShareSheet ? (
                    <>
                      <Share aria-hidden="true" />
                      Share
                    </>
                  ) : (
                    <>
                      <Link2 aria-hidden="true" />
                      {linkCopied ? "Link copied" : "Copy link"}
                    </>
                  )}
                </Button>
              </div>

              <p className="mt-4 text-center text-[0.88rem] text-subtle max-[900px]:mt-6">
                Questions?{" "}
                <a
                  className="underline underline-offset-2 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
                  href="mailto:brockcsc@gmail.com"
                >
                  Contact the organizers
                </a>
              </p>
            </div>
          </section>
        )}
      </div>

      {!loading && !error && event && showBar && (
        <div
          className={cn(
            "sticky bottom-0 z-30 mt-6 flex gap-3 border-t-2 border-line bg-surface pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] min-[901px]:hidden",
            bleed,
          )}
          data-event-action-bar=""
        >
          {action ? (
            <Button
              asChild
              className="h-12 min-w-0 flex-1 text-base"
              size="lg"
              variant="primary"
            >
              <a href={action.href} rel="noopener noreferrer" target="_blank">
                {action.label}
              </a>
            </Button>
          ) : calendarStart !== null ? (
            <CalendarControl
              className="h-12 min-w-0 flex-1 text-base"
              event={event}
              platform={platform}
              size="lg"
              start={calendarStart}
              variant="primary"
            />
          ) : null}
          {action && calendarStart !== null && (
            <CalendarControl
              className="h-12 w-12 px-0 has-[>svg]:px-0"
              event={event}
              iconOnly
              platform={platform}
              start={calendarStart}
              variant="outline"
            />
          )}
          <Button
            aria-label={useShareSheet ? "Share" : "Copy link"}
            className="h-12 w-12 px-0 has-[>svg]:px-0"
            onClick={() => shareEvent(copyLinkWithToast)}
            variant="outline"
          >
            {useShareSheet ? (
              <Share aria-hidden="true" className="size-5" />
            ) : (
              <Link2 aria-hidden="true" className="size-5" />
            )}
          </Button>
        </div>
      )}
    </main>
  );
}
