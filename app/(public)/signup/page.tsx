"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { signup } from "@/lib/api";
import { usernameFor } from "@/lib/auth/username";

const Field = ({
  id,
  label,
  optional,
  ...props
}: {
  id: string;
  label: string;
  optional?: boolean;
} & React.ComponentProps<"input">) => (
  <div>
    <label className="mb-1 block text-sm font-bold" htmlFor={id}>
      {label}
      {optional && <span className="font-normal text-subtle"> (optional)</span>}
    </label>
    <input
      id={id}
      className="w-full rounded-[10px] border-2 border-line bg-surface px-3 py-2 text-ink"
      {...props}
    />
  </div>
);

export default function SignupPage() {
  const [form, setForm] = useState({
    inviteCode: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    studentId: "",
    isFormerExec: false,
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [assigned, setAssigned] = useState("");

  const set =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const former = form.isFormerExec;

  const username = usernameFor(form.firstName, form.lastName);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      const result = await signup(form);
      setAssigned(result.username);
      setConfirmation(result.confirmationCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      {confirmation !== null ? (
        <div className="w-full max-w-md rounded-[20px] border-2 border-line bg-surface p-6 text-center shadow-brut sm:p-8">
          <h1 className="mb-2 text-2xl font-extrabold text-brand">
            Request submitted
          </h1>
          <p className="text-sm text-subtle">
            Your account <span className="font-bold">{assigned}</span> is
            waiting for a co-president to approve it.
          </p>

          <div className="my-6 rounded-[12px] border-2 border-line bg-tint p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-subtle">
              Your confirmation code
            </div>
            <div className="my-1 break-all text-3xl font-extrabold tracking-[0.25em] text-brand">
              {confirmation}
            </div>
            <p className="text-xs text-subtle">
              Send this to the co-president approving you, so they can check
              it&apos;s really you. It is shown once — screenshot it now.
            </p>
          </div>

          <p className="text-sm text-subtle">
            You can{" "}
            <Link href="/admin" className="underline">
              sign in
            </Link>{" "}
            once it is approved.
          </p>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md rounded-[20px] border-2 border-line bg-surface p-6 shadow-brut sm:p-8"
        >
          <h1 className="mb-1 text-center text-2xl font-extrabold text-brand">
            Request an exec account
          </h1>
          <p className="mb-6 text-center text-sm text-subtle">
            An admin approves your account before you can sign in.
          </p>

          <div className="flex flex-col gap-4">
            <Field
              id="inviteCode"
              label="Invite code"
              value={form.inviteCode}
              onChange={set("inviteCode")}
              autoFocus
              required
            />

            <div className="grid grid-cols-2 gap-3">
              <Field
                id="firstName"
                label="First name"
                value={form.firstName}
                onChange={set("firstName")}
                required
              />
              <Field
                id="lastName"
                label="Last name"
                value={form.lastName}
                onChange={set("lastName")}
                required
              />
            </div>

            {username && (
              <p className="text-sm text-subtle">
                Your username will be{" "}
                <span className="font-bold text-brand">{username}</span>
              </p>
            )}

            <label className="mb-4 flex items-start gap-2 text-sm">
              <input
                checked={former}
                className="mt-1 accent-[#9A4440]"
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    isFormerExec: e.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span>
                I&apos;m a former executive
                <span className="block text-subtle">
                  Alumni no longer have a Brock email or student number, so
                  those become optional.
                </span>
              </span>
            </label>

            <Field
              id="email"
              label={former ? "Email" : "Brock email"}
              type="email"
              placeholder={former ? undefined : "you@brocku.ca"}
              value={form.email}
              onChange={set("email")}
              required
            />
            <Field
              id="studentId"
              label="Student number"
              inputMode="numeric"
              optional={former}
              value={form.studentId}
              onChange={set("studentId")}
              required={!former}
            />
            <Field
              id="phone"
              label="Phone"
              type="tel"
              optional
              value={form.phone}
              onChange={set("phone")}
            />
            <Field
              id="password"
              label="Password"
              type="password"
              value={form.password}
              onChange={set("password")}
              minLength={8}
              required
            />
            <Field
              id="confirmPassword"
              label="Confirm password"
              type="password"
              value={form.confirmPassword}
              onChange={set("confirmPassword")}
              minLength={8}
              required
            />
          </div>

          {error && (
            <p className="mt-4 text-sm font-semibold text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <Button type="submit" className="mt-6 w-full" disabled={submitting}>
            {submitting ? "Submitting..." : "Request account"}
          </Button>
        </form>
      )}
    </div>
  );
}
