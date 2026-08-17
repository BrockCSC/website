"use client";

import Image from "next/image";
import Link from "next/link";
import { CalendarPlus, ChevronLeft, Link2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchEventById, type EventRecord, type WithKey } from "@/lib/api";
import { downloadEventIcs } from "@/lib/events/ics";
import {
  formatEventDateLabel,
  formatEventTimeLabel,
  getEventTiming,
  getEventStartTimestamp,
  getRecurrenceLabel,
} from "@/lib/events/schedule";

type EventItem = WithKey<EventRecord>;

const EMPTY_IMAGE = "/logo-black.svg";
const NOT_FOUND_MESSAGE = "Event not found.";

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

export default function EventDetailPageClient() {
  const params = useParams<{ eventId: string }>();
  const eventId = params.eventId;

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

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setLinkCopied(false);
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

  return (
    <main className="min-h-screen bg-surface pt-6 pb-16 text-ink">
      <div>
        <Button
          asChild
          className="h-auto p-0 text-[0.92rem] font-semibold text-subtle"
          variant="link"
        >
          <Link href="/events">
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
            className="mt-4 grid items-start gap-8 min-[901px]:grid-cols-[320px_1fr]"
            role="status"
          >
            <div className="mx-auto aspect-[3/4] w-full max-w-[320px] animate-pulse rounded-[18px] border-2 border-line bg-raised min-[901px]:max-w-none" />
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
          <section className="animate-fade-in mt-4 grid items-start gap-8 min-[901px]:grid-cols-[320px_1fr]">
            <div className="brand-shadow-lg relative mx-auto aspect-[3/4] w-full max-w-[320px] overflow-hidden rounded-[18px] border-2 border-line bg-raised min-[901px]:max-w-none">
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
                  <Badge variant="default">DSC Event</Badge>
                  {recurrenceLabel && (
                    <Badge variant="blue">{recurrenceLabel}</Badge>
                  )}
                </div>
              )}

              <h1 className="m-0 font-semibold text-[clamp(2rem,4vw,3.35rem)] leading-[1.02]">
                {event.title ?? "Untitled Event"}
              </h1>

              <p className="mt-4 max-w-[62ch] border-l-4 border-line/25 pl-4 leading-[1.55] text-subtle">
                {event.description ?? "More details coming soon."}
              </p>

              <div className="mt-6 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
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

              <div className="mt-6 flex flex-wrap gap-3">
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

                {!isPastEvent && calendarStartTimestamp !== null ? (
                  <Button
                    onClick={() =>
                      downloadEventIcs(event, calendarStartTimestamp)
                    }
                    variant={action ? "outline" : "primary"}
                  >
                    <CalendarPlus aria-hidden="true" />
                    Add to Calendar
                  </Button>
                ) : null}

                <Button onClick={copyLink} variant="outline">
                  <Link2 aria-hidden="true" />
                  {linkCopied ? "Link copied" : "Copy link"}
                </Button>
              </div>

              <p className="mt-4 text-center text-[0.88rem] text-subtle">
                Questions?{" "}
                <a
                  className="underline underline-offset-2"
                  href="mailto:brockcsc@gmail.com"
                >
                  Contact the organizers
                </a>
              </p>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
