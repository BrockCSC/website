"use client";

import { Calendar } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  EventRecord,
  WithKey,
  createEvent,
  deleteEvent,
  editEvent,
} from "@/lib/api";
import { ImageUpload } from "@/components/ui/image-upload";
import { Button } from "@/components/ui/button";
import type { SheetCloseReason } from "@/components/ui/sheet";
import { COARSE_QUERY, mediaMatches } from "@/lib/use-media-query";
import { ask, isAskOpen } from "../ask";
import { Label } from "../users/ui";
import { EditorSheet, btn, errorText, field, helpText } from "./ui";

type EventItem = WithKey<EventRecord>;

type Errors = Partial<
  Record<"title" | "start" | "end" | "signupUrl" | "form", string>
>;

type Values = {
  title: string;
  presenter: string;
  location: string;
  description: string;
  posterUrl: string;
  start: string;
  end: string;
  recurrenceUnit: string;
  recurrenceInterval: string;
  signupUrl: string;
};

const joinDatetime = (date?: string, time?: string) =>
  date && time ? `${date}T${time}` : "";

const isHttpUrl = (value: string) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

const valuesFor = (event: EventItem | null): Values => {
  const schedule = event?.schedule;
  return {
    title: event?.title ?? "",
    presenter: event?.presenter ?? "",
    location: event?.location ?? "",
    description: event?.description ?? "",
    posterUrl: event?.image?.url ?? "",
    start: joinDatetime(schedule?.startDate, schedule?.startTime),
    end: joinDatetime(schedule?.endDate, schedule?.endTime),
    recurrenceUnit: schedule?.recurrence?.unit ?? "none",
    recurrenceInterval: String(schedule?.recurrence?.interval ?? 1),
    signupUrl: event?.signupUrl ?? "",
  };
};

/* ------------------------------------------------------------ drafts */

// Unsaved editor changes, mirrored to sessionStorage while the form is dirty
// so Back (edge swipe, Android back, browser back) never loses them (spec
// D22). Every storage access is wrapped: private windows and blocked site
// data throw, and the editor must keep working without a store.

export const eventDraftKey = (key: string) => `event-draft:${key}`;

export function loadEventDraft(key: string): Values | null {
  try {
    const raw = window.sessionStorage.getItem(eventDraftKey(key));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? { ...valuesFor(null), ...(parsed as Partial<Values>) }
      : null;
  } catch {
    return null;
  }
}

const saveEventDraft = (key: string, values: Values) => {
  try {
    window.sessionStorage.setItem(eventDraftKey(key), JSON.stringify(values));
  } catch {
    // Storage unavailable: the draft only lives in the open editor.
  }
};

export const clearEventDraft = (key: string) => {
  try {
    window.sessionStorage.removeItem(eventDraftKey(key));
  } catch {
    // Nothing to clear.
  }
};

/* ------------------------------------------------------------ editor */

type EditorProps = {
  open: boolean;
  /** 'new' or the event's key; also names the draft. */
  draftKey: string;
  /** The event being edited; null for a new one. Read when the editor opens. */
  event: EventItem | null;
  /** Apply the stored draft straight away (the "Reopen" toast). */
  restore: boolean;
  onSaved: () => void;
  onDeleted: (title: string) => void;
  /** Explicit dismissal (Cancel, ×, a desk Esc); the draft is already cleared. */
  onDiscard: () => void;
  /** Back on a coarse pointer, or a forced close: `kept` when a draft was saved. */
  onKeep: (kept: boolean) => void;
};

/**
 * The event editor. Always mounted by the page; `open` drives it (the close
 * invariant, spec D4). Each opening is a new session, so the fields reseed
 * from the event (or the draft), and the closing animation keeps showing the
 * event it opened with.
 */
export default function EventEditor(props: EditorProps) {
  const { open, event, draftKey } = props;
  const [session, setSession] = useState(open ? 1 : 0);
  const [wasOpen, setWasOpen] = useState(open);
  const [opened, setOpened] = useState({ event, draftKey });
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSession(session + 1);
      setOpened({ event, draftKey });
    }
  }
  if (session === 0) return null;

  return (
    <EditorForm
      key={session}
      {...props}
      draftKey={opened.draftKey}
      event={opened.event}
    />
  );
}

function DateTimeField({
  id,
  label,
  clearLabel,
  value,
  error,
  help,
  onChange,
}: {
  id: string;
  label: string;
  clearLabel: string;
  value: string;
  error?: string;
  help?: React.ReactNode;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>
          {label}
          {!value && (
            <span className="hidden font-semibold text-subtle pointer-coarse:inline">
              {" "}
              · Not set (TBA)
            </span>
          )}
        </Label>
        {value && (
          <button
            aria-label={clearLabel}
            className="press-flat -my-2 hidden min-h-9 items-center rounded-[10px] px-2 text-sm font-bold text-ink underline underline-offset-4 pointer-coarse:inline-flex"
            onClick={() => onChange("")}
            type="button"
          >
            Clear
          </button>
        )}
      </div>
      {/* No appearance-none: it collapses the control on iOS and hides
          Android's picker cue. The Calendar glyph shows on touch, where iOS
          draws none; Android's own indicator is faded under it but still
          opens the picker. */}
      <div className="relative">
        <input
          aria-invalid={!!error}
          className={`${field} ${error ? "border-destructive" : ""} w-full min-w-0 text-left pointer-coarse:min-h-11 pointer-coarse:pr-10 [&::-webkit-date-and-time-value]:text-left pointer-coarse:[&::-webkit-calendar-picker-indicator]:opacity-0`}
          id={id}
          onChange={(e) => onChange(e.target.value)}
          type="datetime-local"
          value={value}
        />
        <Calendar
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3 hidden size-5 -translate-y-1/2 text-subtle pointer-coarse:block"
        />
      </div>
      {error ? <p className={errorText}>{error}</p> : help}
    </div>
  );
}

function EditorForm({
  open,
  draftKey,
  event,
  restore,
  onSaved,
  onDeleted,
  onDiscard,
  onKeep,
}: EditorProps) {
  const variant = event ? "edit" : "create";
  const [initial] = useState(() => valuesFor(event));
  // A draft left by an earlier Back: applied now (Reopen) or offered.
  const [stored] = useState(() => loadEventDraft(draftKey));
  const [values, setValues] = useState<Values>(
    () => (restore && stored) || initial,
  );
  const [offer, setOffer] = useState(!restore && stored != null);
  const [touched, setTouched] = useState(restore && stored != null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const busy = isSaving || isDeleting;

  const dirty = JSON.stringify(values) !== JSON.stringify(initial);

  // Latest values for the Sheet's close handler.
  const live = useRef({ dirty, busy });
  useEffect(() => {
    live.current = { dirty, busy };
  });

  // Mirror the draft once the user has changed something, so a Back that
  // closes the editor keeps it. Reverting every change removes it again.
  useEffect(() => {
    if (!touched) return;
    if (dirty) saveEventDraft(draftKey, values);
    else clearEventDraft(draftKey);
  }, [touched, dirty, draftKey, values]);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setTouched(true);
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const clear = (key: keyof Errors) =>
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

  const validate = (): Errors => {
    const next: Errors = {};
    const { title, start, end, recurrenceUnit, signupUrl } = values;
    if (!title.trim()) next.title = "Give the event a title.";
    if (end && !start) next.start = "Add a start before an end.";
    if (start && end && end <= start) {
      next.end = "The end has to come after the start.";
    }
    if (recurrenceUnit !== "none" && !start) {
      next.start = "A repeating event needs a first date and time.";
    }
    if (signupUrl.trim() && !isHttpUrl(signupUrl.trim())) {
      next.signupUrl = "Use a full link, starting with https://";
    }
    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      // Bring the first problem into view (no focus: that would raise the
      // keyboard on a phone).
      requestAnimationFrame(() =>
        formRef.current
          ?.querySelector('[aria-invalid="true"]')
          ?.scrollIntoView({ block: "center" }),
      );
      return;
    }

    setIsSaving(true);
    try {
      const [startDate, startTime] = values.start.split("T");
      const [endDate, endTime] = values.end.split("T");
      const schedule = event?.schedule;

      const nextSchedule: NonNullable<EventRecord["schedule"]> = {};
      if (startDate) nextSchedule.startDate = startDate;
      if (startTime) nextSchedule.startTime = startTime;
      if (endDate) nextSchedule.endDate = endDate;
      if (endTime) nextSchedule.endTime = endTime;
      if (values.recurrenceUnit !== "none") {
        nextSchedule.recurrence = {
          interval: Math.max(1, Number(values.recurrenceInterval) || 1),
          unit: values.recurrenceUnit as "day" | "week" | "month",
          ...(schedule?.recurrence?.unit === values.recurrenceUnit &&
          schedule.recurrence.byWeekday
            ? { byWeekday: schedule.recurrence.byWeekday }
            : {}),
        };
      }

      const eventData: EventRecord = {
        title: values.title.trim(),
        presenter: values.presenter,
        location: values.location,
        description: values.description,
        signupUrl: values.signupUrl.trim(),
        image: values.posterUrl ? { url: values.posterUrl } : {},
        schedule: nextSchedule,
      };

      if (variant === "edit" && event?.$key) {
        await editEvent(event.$key, eventData);
      } else {
        await createEvent(eventData);
      }

      clearEventDraft(draftKey);
      setIsSaving(false);
      onSaved();
    } catch (error) {
      console.error("Failed to save event:", error);
      setErrors({
        form: "Couldn't save this event. Please try again in a moment.",
      });
      setIsSaving(false);
    }
  };

  const remove = async () => {
    if (!event || busy) return;
    const name = event.title || "this event";
    const ok = await ask({
      title: `Delete ${name}?`,
      detail:
        "It's removed from the website for good, along with its poster and sign-up link. This cannot be undone.",
      confirmLabel: "Delete event",
      destructive: true,
    });
    if (ok === null) return;
    setIsDeleting(true);
    setErrors({});
    try {
      await deleteEvent(event.$key);
      clearEventDraft(draftKey);
      setIsDeleting(false);
      onDeleted(name);
    } catch {
      setErrors({ form: "Couldn't delete this event. Try again." });
      setIsDeleting(false);
    }
  };

  // Cancel, × and a desk Esc: an explicit dismissal, so ask first.
  const requestClose = async () => {
    if (live.current.busy) return;
    if (live.current.dirty) {
      const ok = await ask({
        title: "Discard this event?",
        detail:
          variant === "create"
            ? "The new event hasn't been created."
            : "Your changes haven't been saved.",
        confirmLabel: "Discard",
        destructive: true,
      });
      if (ok === null) return;
    }
    clearEventDraft(draftKey);
    onDiscard();
  };

  // Back on a coarse pointer (Android back, iPad Esc) and a forced close:
  // close, and keep the draft (spec D22).
  const keep = () => {
    const kept = live.current.dirty;
    if (kept) saveEventDraft(draftKey, values);
    onKeep(kept);
  };

  const onClose = (reason: SheetCloseReason) => {
    if (live.current.busy) return;
    switch (reason) {
      case "close-button":
        void requestClose();
        return;
      case "cancel":
        if (mediaMatches(COARSE_QUERY)) keep();
        else if (!isAskOpen()) void requestClose();
        return;
      case "forced":
        keep();
        return;
      case "backdrop":
        // The old overlay ignored backdrop clicks; a stray click must not
        // throw an event away.
        return;
    }
  };

  const title = variant === "create" ? "New event" : "Edit event";
  const repeating = values.recurrenceUnit !== "none";

  return (
    <EditorSheet
      busy={busy}
      onClose={onClose}
      open={open}
      phoneAction={
        <button
          aria-busy={isSaving || undefined}
          className="press min-h-11 min-w-11 rounded-[16px] border-2 border-line bg-brand px-4 font-bold text-brand-ink shadow-brut-sm disabled:opacity-60 forced-colors:border-[ButtonText]"
          disabled={busy}
          form="event-form"
          type="submit"
        >
          {isSaving ? "Saving…" : variant === "create" ? "Create" : "Save"}
        </button>
      }
      title={title}
    >
      <form
        className="flex min-h-0 flex-1 flex-col"
        id="event-form"
        noValidate
        onSubmit={handleSubmit}
        ref={formRef}
      >
        <div
          className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 phone:pr-[max(1rem,env(safe-area-inset-right))] phone:pl-[max(1rem,env(safe-area-inset-left))] phone:pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          data-scroll-allow
        >
          {errors.form && (
            <p
              className="animate-rise-in rounded-[10px] border-2 border-destructive px-3 py-2 text-sm font-bold text-destructive desk:hidden"
              role="alert"
            >
              {errors.form}
            </p>
          )}

          {offer && (
            <div
              className="flex animate-rise-in flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border-2 border-line bg-tint px-3 py-2"
              role="status"
            >
              <p className="min-w-0 flex-1 text-sm font-bold text-ink">
                You have unsaved changes from earlier.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    clearEventDraft(draftKey);
                    setOffer(false);
                  }}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  Dismiss
                </Button>
                <Button
                  onClick={() => {
                    if (stored) {
                      setValues(stored);
                      setTouched(true);
                    }
                    setOffer(false);
                  }}
                  size="sm"
                  type="button"
                  variant="primary"
                >
                  Restore unsaved changes
                </Button>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="title">Title</Label>
            <input
              aria-invalid={!!errors.title}
              autoCapitalize="sentences"
              className={`${field} ${errors.title ? "border-destructive" : ""}`}
              enterKeyHint="next"
              id="title"
              onChange={(e) => {
                set("title", e.target.value);
                clear("title");
              }}
              placeholder="e.g. Intro to Python Workshop"
              type="text"
              value={values.title}
            />
            {errors.title && <p className={errorText}>{errors.title}</p>}
          </div>

          {/* When: the fields people come to change most. */}
          <div className="grid gap-5 sm:grid-cols-2">
            <DateTimeField
              clearLabel="Clear start time"
              error={errors.start}
              help={
                <p className={helpText}>
                  Leave empty for a date to be announced.
                </p>
              }
              id="start"
              label="Starts"
              onChange={(value) => {
                set("start", value);
                clear("start");
              }}
              value={values.start}
            />
            <DateTimeField
              clearLabel="Clear end time"
              error={errors.end}
              id="end"
              label="Ends"
              onChange={(value) => {
                set("end", value);
                clear("end");
              }}
              value={values.end}
            />
          </div>

          <div>
            <Label htmlFor="recurrence">Repeats</Label>
            <div className="flex gap-3">
              {repeating && (
                <input
                  aria-label="Repeat interval"
                  className={`${field} w-20`}
                  inputMode="numeric"
                  min={1}
                  onChange={(e) => set("recurrenceInterval", e.target.value)}
                  type="number"
                  value={values.recurrenceInterval}
                />
              )}
              <select
                className={field}
                id="recurrence"
                onChange={(e) => {
                  set("recurrenceUnit", e.target.value);
                  clear("start");
                }}
                value={values.recurrenceUnit}
              >
                <option value="none">Doesn&apos;t repeat</option>
                <option value="day">Days</option>
                <option value="week">Weeks</option>
                <option value="month">Months</option>
              </select>
            </div>
            {repeating && (
              <p className={helpText}>
                The start above is the first occurrence. Set an end date to stop
                the series.
              </p>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="location">Location</Label>
              <input
                className={field}
                enterKeyHint="next"
                id="location"
                onChange={(e) => set("location", e.target.value)}
                placeholder="e.g. MC 402 or a Zoom link"
                type="text"
                value={values.location}
              />
            </div>
            <div>
              <Label htmlFor="presenter">Presenter</Label>
              <input
                autoComplete="off"
                className={field}
                enterKeyHint="next"
                id="presenter"
                onChange={(e) => set("presenter", e.target.value)}
                placeholder="e.g. Jay Shah"
                type="text"
                value={values.presenter}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <textarea
              className={`${field} min-h-[110px]`}
              id="description"
              onChange={(e) => set("description", e.target.value)}
              placeholder="What the event covers, who it's for, anything to bring."
              value={values.description}
            />
          </div>

          <ImageUpload
            label="Poster"
            onChange={(url) => set("posterUrl", url)}
            value={values.posterUrl}
          />

          <div>
            <Label htmlFor="signupUrl">Sign-up link</Label>
            <input
              aria-invalid={!!errors.signupUrl}
              autoCapitalize="none"
              autoCorrect="off"
              className={`${field} ${errors.signupUrl ? "border-destructive" : ""}`}
              enterKeyHint="done"
              id="signupUrl"
              inputMode="url"
              onChange={(e) => {
                set("signupUrl", e.target.value);
                clear("signupUrl");
              }}
              placeholder="https://forms.gle/..."
              spellCheck={false}
              type="url"
              value={values.signupUrl}
            />
            {errors.signupUrl && (
              <p className={errorText}>{errors.signupUrl}</p>
            )}
          </div>

          {variant === "edit" && (
            <div className="border-t-2 border-line pt-5">
              <p className="text-sm font-bold text-ink">Delete this event</p>
              <p className={`${helpText} mt-0.5`}>
                It comes off the website for good, with its poster and sign-up
                link.
              </p>
              <Button
                className="mt-3"
                disabled={busy}
                onClick={() => void remove()}
                size="sm"
                type="button"
                variant="outline-destructive"
              >
                {isDeleting ? "Deleting..." : "Delete event..."}
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t-2 border-line px-5 py-4 phone:hidden">
          {errors.form && (
            <p className={`mr-auto ${errorText} mt-0`}>{errors.form}</p>
          )}
          <button
            className={btn.secondary}
            disabled={busy}
            onClick={() => void requestClose()}
            type="button"
          >
            Cancel
          </button>
          <button className={btn.primary} disabled={busy} type="submit">
            {isSaving
              ? "Saving..."
              : variant === "create"
                ? "Create event"
                : "Save changes"}
          </button>
        </div>
      </form>
    </EditorSheet>
  );
}
