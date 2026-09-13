"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { resetPassword } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { MIN_PASSWORD_LENGTH } from "@/lib/signups/validation";

const field =
  "w-full rounded-[10px] border-2 border-line bg-surface px-3 py-2 text-ink";

function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <>
        <h1 className="text-center text-2xl font-extrabold text-brand">
          Invalid link
        </h1>
        <p className="mt-3 text-center text-sm text-subtle">
          This password reset link is missing its token. Request a new one.
        </p>
        <Button asChild className="mt-6 w-full" variant="outline">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </>
    );
  }

  if (done) {
    return (
      <>
        <h1 className="text-center text-2xl font-extrabold text-brand">
          Password updated
        </h1>
        <p className="mt-3 text-center text-sm text-subtle">
          Your password has been changed. Sign in with it below.
        </p>
        <Button asChild className="mt-6 w-full">
          <Link href="/admin">Sign in</Link>
        </Button>
      </>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(
        (err instanceof ApiError && err.detail) ||
          "Could not reset your password right now.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h1 className="mb-1 text-center text-2xl font-extrabold text-brand">
        Choose a new password
      </h1>
      <p className="mb-6 text-center text-sm text-subtle">
        At least {MIN_PASSWORD_LENGTH} characters.
      </p>

      <label className="mb-1 block text-sm font-bold" htmlFor="password">
        New password
      </label>
      <input
        autoComplete="new-password"
        autoFocus
        className={field}
        id="password"
        onChange={(e) => setPassword(e.target.value)}
        required
        type="password"
        value={password}
      />

      <label
        className="mb-1 mt-4 block text-sm font-bold"
        htmlFor="confirmPassword"
      >
        Confirm new password
      </label>
      <input
        autoComplete="new-password"
        className={field}
        id="confirmPassword"
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
        type="password"
        value={confirmPassword}
      />

      {error && (
        <p
          className="mt-4 rounded-[10px] border-2 border-destructive p-3 text-sm font-bold text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      <Button className="mt-6 w-full" disabled={submitting} type="submit">
        {submitting ? "Saving..." : "Set new password"}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-[20px] border-2 border-line bg-surface p-6 shadow-brut sm:p-8">
        <Suspense
          fallback={
            <p className="text-center text-sm text-subtle">Loading...</p>
          }
        >
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
