"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { login } from "@/lib/api";

const field =
  "w-full rounded-[10px] border-2 border-line bg-surface px-3 py-2 text-sm text-ink outline-none";

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      onSuccess();
    } catch {
      setError("Invalid username or password");
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
            className={field}
            id="password"
            onChange={(e) => setPassword(e.target.value)}
            required
            type="password"
            value={password}
          />

          {error && (
            <p className="mt-4 text-sm font-bold text-destructive">{error}</p>
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
