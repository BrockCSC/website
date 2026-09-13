"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { requestPasswordReset } from "@/lib/api";

const field =
  "w-full rounded-[10px] border-2 border-line bg-surface px-3 py-2 text-ink";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await requestPasswordReset(email);
    } finally {
      // Always show the same result, whether or not the email matched an
      // account — the point of asking the server for a generic answer.
      setSubmitting(false);
      setSent(true);
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
