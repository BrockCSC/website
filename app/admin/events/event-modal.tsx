import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { useState } from "react";
import { EventRecord, WithKey, createEvent, editEvent } from "@/lib/api";

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
  const parseDatetimeLocal = (dateStr?: string, timeStr?: string) => {
    if (!dateStr || !timeStr) return "";
    return `${dateStr}T${timeStr}`;
  };

  const extractDatePart = (datetime?: string) =>
    datetime?.split("T")[0] || selectedEvent?.schedule?.startDate || "";
  const extractTimePart = (datetime?: string) =>
    datetime?.split("T")[1] || selectedEvent?.schedule?.startTime || "";

  const [title, setTitle] = useState(selectedEvent?.title ?? "");
  const [presenter, setPresenter] = useState(selectedEvent?.presenter ?? "");
  const [location, setLocation] = useState(selectedEvent?.location ?? "");
  const [description, setDescription] = useState(
    selectedEvent?.description ?? "",
  );
  const [posterUrl, setPosterUrl] = useState(selectedEvent?.image?.url ?? "");

  const [startDatetime, setStartDatetime] = useState(
    parseDatetimeLocal(
      selectedEvent?.schedule?.startDate,
      selectedEvent?.schedule?.startTime,
    ),
  );
  const [endDatetime, setEndDatetime] = useState(
    parseDatetimeLocal(
      selectedEvent?.schedule?.endDate,
      selectedEvent?.schedule?.endTime,
    ),
  );

  const [recurrenceUnit, setRecurrenceUnit] = useState(
    selectedEvent?.schedule?.recurrence?.unit ?? "none",
  );
  const [signupUrl, setSignupUrl] = useState(selectedEvent?.signupUrl ?? "");

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);

    try {
      const startDate = extractDatePart(startDatetime);
      const startTime = extractTimePart(startDatetime);
      const endDate = extractDatePart(endDatetime);
      const endTime = extractTimePart(endDatetime);

      const eventData: EventRecord = {
        title,
        presenter,
        location,
        description,
        signupUrl,
      };

      if (posterUrl) {
        eventData.image = { url: posterUrl };
      }

      eventData.schedule = {
        startDate,
        startTime,
      };
      if (endDate) {
        eventData.schedule.endDate = endDate;
      }
      if (endTime) {
        eventData.schedule.endTime = endTime;
      }
      if (recurrenceUnit !== "none") {
        eventData.schedule.recurrence = {
          interval: 1,
          unit: recurrenceUnit as "day" | "week" | "month",
        };
      }

      if (variant === "edit" && selectedEvent?.$key) {
        await editEvent(selectedEvent.$key, eventData);
      } else {
        await createEvent(eventData);
      }

      onSave();
      setShowModal(false);
    } catch (error) {
      console.error("Failed to save event:", error);
      setSaveError("Couldn't save this event. Please try again in a moment.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      open={showModal}
      onClose={() => setShowModal(false)}
      title={variant === "create" ? "Add New Event" : "Edit Event"}
    >
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">
            Event Title
          </label>
          <input
            type="text"
            required
            className="w-full rounded border px-3 py-2"
            placeholder="e.g. Intro to Python Workshop"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="flex gap-4 mb-4">
          <div className="flex-1">
            <label className="block text-sm font-semibold mb-1">
              Presenter
            </label>
            <input
              type="text"
              className="w-full rounded border px-3 py-2"
              placeholder="e.g. Jay Shah"
              value={presenter}
              onChange={(e) => setPresenter(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-semibold mb-1">Location</label>
            <input
              type="text"
              className="w-full rounded border px-3 py-2"
              placeholder="e.g. MC 402 or Zoom Link"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">
            Description
          </label>
          <textarea
            className="w-full rounded border px-3 py-2"
            placeholder="Describe the event goals and requirements..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">
            Poster Photo URL
          </label>
          <input
            type="url"
            className="w-full rounded border px-3 py-2"
            placeholder="https://example.com/poster.png"
            value={posterUrl}
            onChange={(e) => setPosterUrl(e.target.value)}
          />
        </div>
        <div className="flex gap-4 mb-4">
          <div className="flex-1">
            <label className="block text-sm font-semibold mb-1">
              Start Date & Time
            </label>
            <input
              type="datetime-local"
              className="w-full rounded border px-3 py-2"
              value={startDatetime}
              onChange={(e) => setStartDatetime(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-semibold mb-1">
              End Date & Time
            </label>
            <input
              type="datetime-local"
              className="w-full rounded border px-3 py-2"
              value={endDatetime}
              onChange={(e) => setEndDatetime(e.target.value)}
            />
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">Recurring</label>
          <select
            className="w-full rounded border px-3 py-2"
            value={recurrenceUnit}
            onChange={(e) => setRecurrenceUnit(e.target.value)}
          >
            <option value="none">none</option>
            <option value="day">day</option>
            <option value="week">week</option>
            <option value="month">month</option>
          </select>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">
            Sign Up URL
          </label>
          <input
            type="url"
            className="w-full rounded border px-3 py-2"
            placeholder="https://github.com/BrockCSC/images.brockcsc.ca/filepath"
            value={signupUrl}
            onChange={(e) => setSignupUrl(e.target.value)}
          />
        </div>
        {saveError && (
          <p className="mb-4 text-sm font-semibold text-red-600">{saveError}</p>
        )}
        <div className="flex gap-4">
          <Button variant="primary" type="submit" disabled={isSaving}>
            {isSaving
              ? "Saving..."
              : variant === "create"
                ? "Create Event"
                : "Save Changes"}
          </Button>
          <Button
            variant="secondary"
            type="button"
            onClick={() => setShowModal(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
