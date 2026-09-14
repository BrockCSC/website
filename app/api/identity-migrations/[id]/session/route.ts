import { NextResponse, type NextRequest } from "next/server";
import { exchangeCredentials } from "@/lib/auth/keycloak";
import { REFRESH_COOKIE, refreshCookieOptions } from "@/lib/auth/mail-token";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
} from "@/lib/auth/session";
import { findMigration } from "@/lib/db/identity-migrations";
import { recordHandoff } from "@/lib/identity/migration";
import { peekPassword } from "@/lib/identity/password-vault";
import { notAuthorized, notFound } from "@/lib/json";
import { migrationViewer } from "../../access";

/**
 * Swaps the member's cookies for ones minted as the new login. Without the
 * confirmed password in memory, both cookies are cleared instead and they
 * sign in again.
 */
export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const record = await findMigration(id);
  if (!record) return notFound();
  const viewer = await migrationViewer(req, record);
  if (!viewer?.own) return notAuthorized();
  if (record.handoff) {
    return NextResponse.json({ done: true, username: record.to.username });
  }
  if (!["cut-over", "done"].includes(record.status)) {
    return NextResponse.json(
      { error: "The cut-over has not happened yet." },
      { status: 409 },
    );
  }

  const password =
    record.passwordSource === "confirmed" ? peekPassword(id) : null;
  const identity = password
    ? await exchangeCredentials(record.to.username, password)
    : null;

  if (identity) {
    await recordHandoff(id, "session");
    const response = NextResponse.json({
      signedIn: true,
      username: record.to.username,
    });
    response.cookies.set(
      SESSION_COOKIE,
      signSession(identity),
      sessionCookieOptions,
    );
    if (identity.refreshToken) {
      response.cookies.set(
        REFRESH_COOKIE,
        identity.refreshToken,
        refreshCookieOptions,
      );
    }
    return response;
  }

  await recordHandoff(id, "relogin");
  const response = NextResponse.json({
    relogin: true,
    username: record.to.username,
  });
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
