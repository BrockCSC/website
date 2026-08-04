"use client";

import { apiFetch, ApiError } from "./client";
import type { SessionUser } from "./types";

export const fetchCurrentUser = async (): Promise<SessionUser | null> => {
  try {
    return await apiFetch<SessionUser>("/api/auth/me");
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
};

export const login = async (
  username: string,
  password: string,
): Promise<SessionUser> =>
  apiFetch<SessionUser>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

export const logout = async (): Promise<void> => {
  await apiFetch("/api/auth/logout", { method: "POST" });
};
