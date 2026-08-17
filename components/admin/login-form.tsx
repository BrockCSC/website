"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { login } from "@/lib/api";
import { ApiError } from "@/lib/api/client";

const field =
  "w-full rounded-[10px] border-2 border-line bg-surface px-3 py-2 text-sm text-ink outline-none";

/** Never says whether the account exists: only a caller who already passed the
 * password check can reach 403, and everyone else gets the same sentence. */
const reason = (err: unknown): string => {
  const status = err instanceof ApiError ? err.status : 0;
  if (status === 429) {
    return "Too many attempts from here. Wait a few minutes, then try again.";
  }
  if (status === 403) {
    return "Those details are right, but this account cannot use the admin area. Ask a co-president to restore your access.";
  }
  return "We could not sign you in. Check your username and password. If you have just requested an account, you cannot sign in until a co-president approves it.";
};

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      onSuccess();
    } catch (err) {
      setError(reason(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-[380px]">
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-subtle">
          BrockCSC
        </p>
        <h1 className="mt-1 text-3xl font-extrabold text-ink">Admin sign in</h1>

        <form
          className="mt-6 rounded-[20px] border-2 border-line bg-surface p-6 shadow-brut"
          onSubmit={handleSubmit}
        >
          <label
            className="mb-1 block text-sm font-bold text-ink"
            htmlFor="username"
          >
            Username
          </label>
          <input
            aria-invalid={error ? true : undefined}
            autoComplete="username"
            autoFocus
            className={field}
            id="username"
            onChange={(e) => setUsername(e.target.value)}
            required
            value={username}
          />

          <label
            className="mb-1 mt-4 block text-sm font-bold text-ink"
            htmlFor="password"
          >
            Password
          </label>
          <input
            aria-invalid={error ? true : undefined}
            autoComplete="current-password"
            className={field}
            id="password"
            onChange={(e) => setPassword(e.target.value)}
            required
            type="password"
            value={password}
          />

          {error && (
            <p
              className="mt-4 rounded-[10px] border-2 border-destructive p-3 text-sm font-bold text-destructive"
              ref={errorRef}
              role="alert"
              tabIndex={-1}
            >
              {error}
            </p>
          )}

          <Button className="mt-6 w-full" disabled={submitting} type="submit">
            {submitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-subtle">
          New executive?{" "}
          <Link
            className="font-bold text-ink underline underline-offset-4 hover:text-brand"
            href="/signup"
          >
            Request an account
          </Link>
        </p>
      </div>
    </div>
  );
}
