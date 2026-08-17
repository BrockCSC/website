import { NextResponse, type NextRequest } from "next/server";
import { accessTokenFor } from "@/lib/auth/mail-token";
import { requireMember } from "@/lib/auth/session";

export const mailToken = async (req: NextRequest): Promise<string | null> =>
  (await requireMember(req)) ? accessTokenFor(req) : null;

export const unauthorized = () =>
  NextResponse.json({ error: "Sign in again" }, { status: 401 });
