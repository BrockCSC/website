import { NextResponse, type NextRequest } from "next/server";
import type { SessionUser } from "@/lib/api/types";
import { accessTokenFor } from "@/lib/auth/mail-token";
import { requireMember } from "@/lib/auth/session";

export const mailUser = async (
  req: NextRequest,
): Promise<{ user: SessionUser; token: string } | null> => {
  const user = await requireMember(req);
  if (!user) return null;
  const token = await accessTokenFor(req);
  return token ? { user, token } : null;
};

export const mailToken = async (req: NextRequest): Promise<string | null> =>
  (await mailUser(req))?.token ?? null;

export const unauthorized = () =>
  NextResponse.json({ error: "Sign in again" }, { status: 401 });
