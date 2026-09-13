"use client";

import { apiFetch, ApiError } from "./client";
import type { SessionUser, SignupInput } from "./types";

export const fetchCurrentUser = async (): Promise<SessionUser | null> => {
  try {
    return await apiFetch<SessionUser>("/api/auth/me");
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
};

export type LoginResult =
  SessionUser | { requiresPasswordReset: true; resetToken: string };

export const login = async (
  username: string,
  password: string,
): Promise<LoginResult> =>
  apiFetch<LoginResult>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

export const logout = async (): Promise<void> => {
  await apiFetch("/api/auth/logout", { method: "POST" });
};

export const requestPasswordReset = async (email: string): Promise<void> => {
  await apiFetch("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
};

export const resetPassword = async (
  token: string,
  password: string,
): Promise<void> => {
  await apiFetch("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
};

export const completeForcedReset = async (
  resetToken: string,
  newPassword: string,
): Promise<void> => {
  await apiFetch("/api/auth/complete-forced-reset", {
    method: "POST",
    body: JSON.stringify({ resetToken, newPassword }),
  });
};

/** Not apiFetch: the sign-up form shows the server's rejection reason. */
export const signup = async (
  input: SignupInput,
): Promise<{
  confirmationCode: string;
  username: string;
  mailbox?: string;
}> => {
  const res = await fetch("/api/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    confirmationCode?: string;
    username?: string;
    mailbox?: string;
  };
  if (!res.ok) {
    throw new Error(body.error ?? "Could not submit your request right now.");
  }
  return {
    confirmationCode: body.confirmationCode ?? "",
    username: body.username ?? "",
    mailbox: body.mailbox,
  };
};
