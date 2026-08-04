"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { login } from "@/lib/api";

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
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-[20px] border-2 border-black bg-white p-8 shadow-[6px_6px_0_0_#000]"
      >
        <h1 className="mb-6 text-center text-2xl font-extrabold text-[#9A4440]">
          Sign in to BrockCSC
        </h1>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-bold" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            className="w-full rounded-[10px] border-2 border-black px-3 py-2"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
          />
        </div>

        <div className="mb-6">
          <label className="mb-1 block text-sm font-bold" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="w-full rounded-[10px] border-2 border-black px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && (
          <p className="mb-4 text-sm font-semibold text-red-600">{error}</p>
        )}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign In"}
        </Button>
      </form>
    </div>
  );
}
