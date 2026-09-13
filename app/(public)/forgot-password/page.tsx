"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { requestPasswordReset } from "@/lib/api";
import { ApiError } from "@/lib/api/client";

const field =
  "w-full rounded-[10px] border-2 border-line bg-surface px-3 py-2 text-ink";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      // The server answers identically whether or not the email matched, so
      // success here says nothing about whether an account exists.
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? "Too many requests from here. Wait a while, then try again."
          : "Couldn't send that right now. Try again in a moment.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-[20px] border-2 border-line bg-surface p-6 shadow-brut sm:p-8">
        {sent ? (
          <>
            <h1 className="text-center text-2xl font-extrabold text-brand">
              Check your email
            </h1>
            <p className="mt-3 text-center text-sm text-subtle">
              If <span className="font-bold text-ink">{email}</span> matches an
              account, we&apos;ve sent password reset instructions to it. The
              link expires in 30 minutes.
            </p>
            <Button asChild className="mt-6 w-full" variant="outline">
              <Link href="/admin">Back to sign in</Link>
            </Button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <h1 className="mb-1 text-center text-2xl font-extrabold text-brand">
              Forgot your password?
            </h1>
            <p className="mb-6 text-center text-sm text-subtle">
              Enter either your @brockcsc.ca or personal email — we&apos;ll send
              reset instructions to both.
            </p>
            <label className="mb-1 block text-sm font-bold" htmlFor="email">
              Email
            </label>
            <input
              autoComplete="email"
              autoFocus
              className={field}
              id="email"
              onChange={(e) => setEmail(e.target.value)}
              required
              type="email"
              value={email}
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
              {submitting ? "Sending..." : "Send reset instructions"}
            </Button>
            <p className="mt-4 text-center text-sm text-subtle">
              <Link className="underline" href="/admin">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
