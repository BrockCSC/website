"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { completeForcedReset, login } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { MIN_PASSWORD_LENGTH } from "@/lib/signups/validation";

const field =
  "w-full rounded-[10px] border-2 border-line bg-surface px-3 py-2 text-sm text-ink outline-none";

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

/** Shown after a co-president-issued temporary password is accepted. */
function ForcedResetForm({
  username,
  resetToken,
  onDone,
}: {
  username: string;
  resetToken: string;
  onDone: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await completeForcedReset(resetToken, newPassword);
      // Reuses the normal login path so the session and refresh cookies end
      // up set exactly the way a regular sign-in sets them.
      await login(username, newPassword);
      onDone();
    } catch (err) {
      setError(
        (err instanceof ApiError && err.detail) ||
          "Could not set your new password. Try signing in again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      className="mt-6 rounded-[20px] border-2 border-line bg-surface p-6 shadow-brut"
      onSubmit={handleSubmit}
    >
      <p className="mb-4 text-sm text-subtle">
        That was a temporary password. Choose a new one to finish signing in.
      </p>

      <label
        className="mb-1 block text-sm font-bold text-ink"
        htmlFor="new-password"
      >
        New password
      </label>
      <input
        aria-invalid={error ? true : undefined}
        autoComplete="new-password"
        autoFocus
        className={field}
        id="new-password"
        onChange={(e) => setNewPassword(e.target.value)}
        required
        type="password"
        value={newPassword}
      />

      <label
        className="mb-1 mt-4 block text-sm font-bold text-ink"
        htmlFor="confirm-new-password"
      >
        Confirm new password
      </label>
      <input
        aria-invalid={error ? true : undefined}
        autoComplete="new-password"
        className={field}
        id="confirm-new-password"
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
        type="password"
        value={confirmPassword}
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
        {submitting ? "Saving..." : "Set password and sign in"}
      </Button>
    </form>
  );
}

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await login(username, password);
      if ("requiresPasswordReset" in result) {
        setResetToken(result.resetToken);
      } else {
        onSuccess();
      }
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

        {resetToken ? (
          <ForcedResetForm
            onDone={onSuccess}
            resetToken={resetToken}
            username={username}
          />
        ) : (
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

            <div className="mb-1 mt-4 flex items-baseline justify-between">
              <label
                className="block text-sm font-bold text-ink"
                htmlFor="password"
              >
                Password
              </label>
              <Link
                className="text-xs font-bold text-subtle underline underline-offset-4 hover:text-ink"
                href="/forgot-password"
              >
                Forgot password?
              </Link>
            </div>
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
        )}

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
