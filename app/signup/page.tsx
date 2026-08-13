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
      {optional && (
        <span className="font-normal text-muted-foreground"> (optional)</span>
      )}
    </label>
    <input
      id={id}
      className="w-full rounded-[10px] border-2 border-black px-3 py-2"
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
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const set =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

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
      await signup(form);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      {submitted ? (
        <div className="w-full max-w-md rounded-[20px] border-2 border-black bg-white p-8 text-center shadow-[6px_6px_0_0_#000]">
          <h1 className="mb-2 text-2xl font-extrabold text-[#9A4440]">
            Request submitted
          </h1>
          <p className="text-sm text-muted-foreground">
            Your account <span className="font-bold">{username}</span> is
            waiting for an admin to approve it. You can{" "}
            <Link href="/admin" className="underline">
              sign in
            </Link>{" "}
            once it is approved.
          </p>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md rounded-[20px] border-2 border-black bg-white p-8 shadow-[6px_6px_0_0_#000]"
        >
          <h1 className="mb-1 text-center text-2xl font-extrabold text-[#9A4440]">
            Request an exec account
          </h1>
          <p className="mb-6 text-center text-sm text-muted-foreground">
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
              <p className="text-sm text-muted-foreground">
                Your username will be{" "}
                <span className="font-bold text-[#9A4440]">{username}</span>
              </p>
            )}

            <Field
              id="email"
              label="Email"
              type="email"
              value={form.email}
              onChange={set("email")}
              required
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
            <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>
          )}

          <Button type="submit" className="mt-6 w-full" disabled={submitting}>
            {submitting ? "Submitting..." : "Request account"}
          </Button>
        </form>
      )}
    </div>
  );
}
