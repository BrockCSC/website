import { NextResponse } from "next/server";
import { sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth/session";

export const POST = () => {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions,
    maxAge: 0,
  });
  return response;
};
