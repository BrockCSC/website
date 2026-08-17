"use client";

import { useState } from "react";
import { EventRecord, WithKey, createEvent, editEvent } from "@/lib/api";
import { Label, PosterField, Sheet, btn, errorText, field } from "./ui";

type Errors = Partial<
  Record<"title" | "start" | "end" | "signupUrl" | "form", string>
>;

const joinDatetime = (date?: string, time?: string) =>
  date && time ? `${date}T${time}` : "";

const isHttpUrl = (value: string) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

export default function EventModal({
  showModal,
  setShowModal,
  variant = "create",
  selectedEvent,
  onSave,
}: {
  showModal: boolean;
  setShowModal: (value: boolean) => void;
  variant: "create" | "edit";
  selectedEvent?: WithKey<EventRecord> | null;
  onSave: () => void;
}) {
  const schedule = selectedEvent?.schedule;
  const [title, setTitle] = useState(selectedEvent?.title ?? "");
  const [presenter, setPresenter] = useState(selectedEvent?.presenter ?? "");
  const [location, setLocation] = useState(selectedEvent?.location ?? "");
  const [description, setDescription] = useState(
    selectedEvent?.description ?? "",
  );
  const [posterUrl, setPosterUrl] = useState(selectedEvent?.image?.url ?? "");
  const [startDatetime, setStartDatetime] = useState(
    joinDatetime(schedule?.startDate, schedule?.startTime),
  );
  const [endDatetime, setEndDatetime] = useState(
    joinDatetime(schedule?.endDate, schedule?.endTime),
  );
  const [recurrenceUnit, setRecurrenceUnit] = useState(
    schedule?.recurrence?.unit ?? "none",
  );
  const [recurrenceInterval, setRecurrenceInterval] = useState(
    String(schedule?.recurrence?.interval ?? 1),
  );
  const [signupUrl, setSignupUrl] = useState(selectedEvent?.signupUrl ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  if (!showModal) return null;

  const clear = (key: keyof Errors) =>
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

  const validate = (): Errors => {
    const next: Errors = {};
    if (!title.trim()) next.title = "Give the event a title.";
    if (endDatetime && !startDatetime) {
      next.start = "Add a start before an end.";
    }
    if (startDatetime && endDatetime && endDatetime <= startDatetime) {
      next.end = "The end has to come after the start.";
    }
    if (recurrenceUnit !== "none" && !startDatetime) {
      next.start = "A repeating event needs a first date and time.";
    }
    if (signupUrl.trim() && !isHttpUrl(signupUrl.trim())) {
      next.signupUrl = "Use a full link, starting with https://";
    }
    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setIsSaving(true);
    try {
      const [startDate, startTime] = startDatetime.split("T");
      const [endDate, endTime] = endDatetime.split("T");

      const nextSchedule: NonNullable<EventRecord["schedule"]> = {};
      if (startDate) nextSchedule.startDate = startDate;
      if (startTime) nextSchedule.startTime = startTime;
      if (endDate) nextSchedule.endDate = endDate;
      if (endTime) nextSchedule.endTime = endTime;
      if (recurrenceUnit !== "none") {
        nextSchedule.recurrence = {
          interval: Math.max(1, Number(recurrenceInterval) || 1),
          unit: recurrenceUnit as "day" | "week" | "month",
          ...(schedule?.recurrence?.unit === recurrenceUnit &&
          schedule.recurrence.byWeekday
            ? { byWeekday: schedule.recurrence.byWeekday }
            : {}),
        };
      }

      const eventData: EventRecord = {
        title: title.trim(),
        presenter,
        location,
        description,
        signupUrl: signupUrl.trim(),
        image: posterUrl ? { url: posterUrl } : {},
        schedule: nextSchedule,
      };

      if (variant === "edit" && selectedEvent?.$key) {
        await editEvent(selectedEvent.$key, eventData);
      } else {
        await createEvent(eventData);
      }

      onSave();
      setShowModal(false);
    } catch (error) {
      console.error("Failed to save event:", error);
      setErrors({
        form: "Couldn't save this event. Please try again in a moment.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const close = () => setShowModal(false);

  return (
    <Sheet
      onClose={close}
      title={variant === "create" ? "New event" : "Edit event"}
    >
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div>
            <Label htmlFor="title">Title</Label>
            <input
              aria-invalid={!!errors.title}
              className={`${field} ${errors.title ? "border-red-600 dark:border-red-400" : ""}`}
              id="title"
              onChange={(e) => {
                setTitle(e.target.value);
                clear("title");
              }}
              placeholder="e.g. Intro to Python Workshop"
              type="text"
              value={title}
            />
            {errors.title && <p className={errorText}>{errors.title}</p>}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="presenter">Presenter</Label>
              <input
                className={field}
                id="presenter"
                onChange={(e) => setPresenter(e.target.value)}
                placeholder="e.g. Jay Shah"
                type="text"
                value={presenter}
              />
            </div>
            <div>
              <Label htmlFor="location">Location</Label>
              <input
                className={field}
                id="location"
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. MC 402 or a Zoom link"
                type="text"
                value={location}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <textarea
              className={`${field} min-h-[110px]`}
              id="description"
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What the event covers, who it's for, anything to bring."
              value={description}
            />
          </div>

          <PosterField onChange={setPosterUrl} value={posterUrl} />

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="start">Starts</Label>
              <input
                aria-invalid={!!errors.start}
                className={`${field} ${errors.start ? "border-red-600 dark:border-red-400" : ""}`}
                id="start"
                onChange={(e) => {
                  setStartDatetime(e.target.value);
                  clear("start");
                }}
                type="datetime-local"
                value={startDatetime}
              />
              {errors.start ? (
                <p className={errorText}>{errors.start}</p>
              ) : (
                <p className="mt-1 text-xs text-subtle">
                  Leave empty for a date to be announced.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="end">Ends</Label>
              <input
                aria-invalid={!!errors.end}
                className={`${field} ${errors.end ? "border-red-600 dark:border-red-400" : ""}`}
                id="end"
                onChange={(e) => {
                  setEndDatetime(e.target.value);
                  clear("end");
                }}
                type="datetime-local"
                value={endDatetime}
              />
              {errors.end && <p className={errorText}>{errors.end}</p>}
            </div>
          </div>

          <div>
            <Label htmlFor="recurrence">Repeats</Label>
            <div className="flex gap-3">
              {recurrenceUnit !== "none" && (
                <input
                  aria-label="Repeat interval"
                  className={`${field} w-20`}
                  min={1}
                  onChange={(e) => setRecurrenceInterval(e.target.value)}
                  type="number"
                  value={recurrenceInterval}
                />
              )}
              <select
                className={field}
                id="recurrence"
                onChange={(e) => {
                  setRecurrenceUnit(e.target.value);
                  clear("start");
                }}
                value={recurrenceUnit}
              >
                <option value="none">Doesn&apos;t repeat</option>
                <option value="day">Days</option>
                <option value="week">Weeks</option>
                <option value="month">Months</option>
              </select>
            </div>
            {recurrenceUnit !== "none" && (
              <p className="mt-1 text-xs text-subtle">
                The start above is the first occurrence. Set an end date to stop
                the series.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="signupUrl">Sign-up link</Label>
            <input
              aria-invalid={!!errors.signupUrl}
              className={`${field} ${errors.signupUrl ? "border-red-600 dark:border-red-400" : ""}`}
              id="signupUrl"
              onChange={(e) => {
                setSignupUrl(e.target.value);
                clear("signupUrl");
              }}
              placeholder="https://forms.gle/..."
              type="url"
              value={signupUrl}
            />
            {errors.signupUrl && (
              <p className={errorText}>{errors.signupUrl}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t-2 border-line px-5 py-4">
          {errors.form && (
            <p className={`mr-auto ${errorText} mt-0`}>{errors.form}</p>
          )}
          <button
            className={btn.secondary}
            disabled={isSaving}
            onClick={close}
            type="button"
          >
            Cancel
          </button>
          <button className={btn.primary} disabled={isSaving} type="submit">
            {isSaving
              ? "Saving..."
              : variant === "create"
                ? "Create event"
                : "Save changes"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
