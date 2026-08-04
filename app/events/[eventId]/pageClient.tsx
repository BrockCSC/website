"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchEventById, type EventRecord, type WithKey } from "@/lib/api";
import {
  formatEventDateLabel,
  formatEventTimeLabel,
  getEventTiming,
  getEventStartTimestamp,
  getRecurrenceLabel,
} from "@/lib/events/schedule";

type EventItem = WithKey<EventRecord>;

const EMPTY_IMAGE = "/logo-black.svg";

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
          setError("Event not found.");
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
  }, [eventId]);

  const recurrenceLabel = useMemo(
    () => (event ? getRecurrenceLabel(event) : null),
    [event],
  );
  const isPastEvent = useMemo(() => {
    if (!event) {
      return false;
    }

    const timing = getEventTiming(event, now);
    return !timing.isOngoing && timing.nextStartTimestamp === null;
  }, [event, now]);
  const eventStartTimestamp = useMemo(
    () => (event ? getEventStartTimestamp(event) : null),
    [event],
  );
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
    <main className="min-h-screen bg-white pt-6 pb-16 text-foreground">
      <div>
        <Button
          asChild
          className="h-auto p-0 text-[0.92rem] font-semibold text-muted-foreground"
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
          <p className="mt-4 text-muted-foreground">Loading event...</p>
        )}
        {error && <p className="mt-4 text-muted-foreground">{error}</p>}

        {!loading && !error && event && (
          <section className="mt-4 grid items-start gap-8 min-[901px]:grid-cols-[320px_1fr]">
            <div className="brand-shadow-lg relative aspect-[3/4] overflow-hidden rounded-[18px] border-2 border-foreground bg-muted">
              {hasImage && (
                <div
                  className="absolute -inset-4 bg-cover bg-center blur-[14px] brightness-75"
                  style={{ backgroundImage: `url(${imageSrc})` }}
                />
              )}
              <Image
                alt={event.title ?? "Event poster"}
                className={`relative z-[1] object-contain ${hasImage ? "p-3" : "bg-primary p-7"}`}
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

              <p className="mt-4 hidden max-w-[62ch] border-l-4 border-border pl-4 leading-[1.55] text-muted-foreground min-[641px]:block">
                {event.description ?? "More details coming soon."}
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3">
                {infoCards.map((card) => (
                  <article className="detail-info-card" key={card.label}>
                    <h3 className="m-0 text-[0.8rem] uppercase tracking-[0.08em] text-muted-foreground">
                      {card.label}
                    </h3>
                    <p className="mt-1.5 text-base font-bold text-foreground">
                      {card.value}
                    </p>
                  </article>
                ))}
              </div>

              {action ? (
                <div className="mt-6">
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
                </div>
              ) : null}

              {isPastEvent && !action && hasRegistrationLink ? (
                <div className="mt-6">
                  <Button
                    className="max-w-full"
                    disabled
                    size="default"
                    variant="secondary"
                  >
                    Event Ended
                  </Button>
                </div>
              ) : null}

              <p className="mt-4 text-center text-[0.88rem] text-muted-foreground">
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
