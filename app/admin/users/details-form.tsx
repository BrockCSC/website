"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { updatePersonDetails, type Signup } from "./api";
import { Label, field } from "./ui";

const ACCESS_CARD_PATTERN = /^\d{5}$/;

type Details = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  studentId: string;
  accessCardId: string;
};

const detailsFrom = (signup: Signup): Details => ({
  firstName: signup.firstName ?? "",
  lastName: signup.lastName ?? "",
  email: signup.email ?? "",
  phone: signup.phone ?? "",
  studentId: signup.studentId ?? "",
  accessCardId: signup.accessCardId ?? "",
});

export default function DetailsForm({
  signup,
  identitiesEditable,
  onSaved,
  onCancel,
}: {
  signup: Signup;
  identitiesEditable: boolean;
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Details>(detailsFrom(signup));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Details>(key: K, value: Details[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const cardInvalid =
    form.accessCardId.trim() !== "" &&
    !ACCESS_CARD_PATTERN.test(form.accessCardId.trim());

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cardInvalid) return;
    setSaving(true);
    setError(null);
    try {
      await updatePersonDetails(signup.$key, form);
      await onSaved();
    } catch (err) {
      setError(
        (err instanceof ApiError && err.detail) ||
          "Could not save these details. Try again in a moment.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={save}>
      {!identitiesEditable && (
        <p className="text-sm text-subtle">
          This environment shares the live Keycloak realm, so the name and email
          save here but the Keycloak account itself is left alone.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="details-first-name">First name</Label>
          <input
            className={field}
            id="details-first-name"
            onChange={(e) => set("firstName", e.target.value)}
            value={form.firstName}
          />
        </div>
        <div>
          <Label htmlFor="details-last-name">Last name</Label>
          <input
            className={field}
            id="details-last-name"
            onChange={(e) => set("lastName", e.target.value)}
            value={form.lastName}
          />
        </div>
        <div>
          <Label htmlFor="details-email">Email</Label>
          <input
            className={field}
            id="details-email"
            onChange={(e) => set("email", e.target.value)}
            type="email"
            value={form.email}
          />
        </div>
        <div>
          <Label htmlFor="details-phone">Phone</Label>
          <input
            className={field}
            id="details-phone"
            onChange={(e) => set("phone", e.target.value)}
            value={form.phone}
          />
        </div>
        <div>
          <Label htmlFor="details-student-id">Student ID</Label>
          <input
            className={field}
            id="details-student-id"
            onChange={(e) => set("studentId", e.target.value)}
            value={form.studentId}
          />
        </div>
        <div>
          <Label htmlFor="details-access-card">Access card ID</Label>
          <input
            aria-invalid={cardInvalid}
            className={field}
            id="details-access-card"
            inputMode="numeric"
            maxLength={5}
            onChange={(e) =>
              set("accessCardId", e.target.value.replace(/\D/g, ""))
            }
            placeholder="5-digit number on the card"
            value={form.accessCardId}
          />
          {cardInvalid && (
            <p className="mt-1 text-xs font-bold text-brand">
              Must be exactly 5 digits.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={saving || cardInvalid}
          size="sm"
          type="submit"
          variant="primary"
        >
          {saving ? "Saving..." : "Save details"}
        </Button>
        <Button
          disabled={saving}
          onClick={onCancel}
          size="sm"
          type="button"
          variant="secondary"
        >
          Cancel
        </Button>
        {error && <span className="text-sm font-bold text-brand">{error}</span>}
      </div>
    </form>
  );
}
