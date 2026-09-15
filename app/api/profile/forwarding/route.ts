import { NextResponse, type NextRequest } from "next/server";
import { requireMember } from "@/lib/auth/session";
import { findSignupByUserId } from "@/lib/db/signups";
import { ownsIdentities } from "@/lib/env";
import { badJson, jsonObject, notAuthorized } from "@/lib/json";
import {
  applyPersonalForwarding,
  forwardingView,
  rehearsePersonalForwarding,
} from "@/lib/mail/personal-forwarding";

const unreachable = () =>
  NextResponse.json(
    { error: "Could not reach the mail server. Try again in a moment." },
    { status: 502 },
  );

const noAccount = () =>
  NextResponse.json({ error: "No linked account" }, { status: 404 });

export const GET = async (req: NextRequest) => {
  const user = await requireMember(req);
  if (!user) return notAuthorized();
  const signup = await findSignupByUserId(user.sub);
  if (!signup) return noAccount();

  try {
    return NextResponse.json(await forwardingView(signup));
  } catch {
    return unreachable();
  }
};

/** Only ever forwards to the personal email already on the sign-up; the body can't name an address. */
export const PUT = async (req: NextRequest) => {
  const user = await requireMember(req);
  if (!user) return notAuthorized();
  const signup = await findSignupByUserId(user.sub);
  if (!signup) return noAccount();

  const body = await jsonObject<{ enabled?: unknown }>(req);
  if (!body || typeof body.enabled !== "boolean") return badJson();
  const enabled = body.enabled;

  try {
    const view = await forwardingView(signup);
    if (enabled && view.blocker) {
      return NextResponse.json(
        { error: "Forwarding can't be turned on for this account." },
        { status: 409 },
      );
    }
    if (!ownsIdentities()) {
      if (enabled) await rehearsePersonalForwarding(signup);
      return NextResponse.json({ ...view, enabled, rehearsed: true });
    }
    await applyPersonalForwarding(signup, enabled);
    return NextResponse.json(await forwardingView(signup));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(
      `mail forwarding change failed for ${signup.username}: ${reason}`,
    );
    // Rehearsal environments exist to catch a script Stalwart won't compile,
    // so they say why; production keeps the mail server's reply out of the page.
    if (!ownsIdentities() && /^Stalwart re(jected|fused)/.test(reason)) {
      return NextResponse.json({ error: reason }, { status: 502 });
    }
    return unreachable();
  }
};
