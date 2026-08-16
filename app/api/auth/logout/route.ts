import { NextResponse } from "next/server";
import { REFRESH_COOKIE, refreshCookieOptions } from "@/lib/auth/mail-token";
import { sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth/session";

export const POST = () => {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions,
    maxAge: 0,
  });
  response.cookies.set(REFRESH_COOKIE, "", {
    ...refreshCookieOptions,
    maxAge: 0,
  });
  return response;
};
