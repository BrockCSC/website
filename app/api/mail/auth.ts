import { NextResponse, type NextRequest } from "next/server";
import type { SessionUser } from "@/lib/api/types";
import { accessTokenFor } from "@/lib/auth/mail-token";
import { requireMailAdmin, requireMember } from "@/lib/auth/session";
import { adminAccess, userAccess, type Access } from "@/lib/mail/access";
import { listUsers, type MailUser } from "@/lib/mail/stalwart";

export type MailScope = {
  user: SessionUser;
  access: Access;
  token: string | null;
  viewing: MailUser | null;
};

const LOCAL_PART = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** `?as=<localPart>` lets a mail admin read another account, read-only. */
export const mailScope = async (
  req: NextRequest,
): Promise<MailScope | null> => {
  const as = new URL(req.url).searchParams.get("as");
  if (as === null) {
    const user = await requireMember(req);
    if (!user) return null;
    const token = await accessTokenFor(req);
    if (!token) return null;
    return { user, access: userAccess(token), token, viewing: null };
  }

  const user = await requireMailAdmin(req);
  if (!user || !LOCAL_PART.test(as)) return null;
  const viewing = (await listUsers()).find((mailbox) => mailbox.name === as);
  if (!viewing) return null;
  console.info(`mail-admin ${user.email} reading ${viewing.emailAddress}`);
  return { user, access: adminAccess(viewing.id), token: null, viewing };
};

export const mailAccess = async (req: NextRequest): Promise<Access | null> =>
  (await mailScope(req))?.access ?? null;

export const unauthorized = () =>
  NextResponse.json({ error: "Sign in again" }, { status: 401 });

export const viewOnly = () =>
  NextResponse.json(
    {
      error:
        "You are reading this inbox as an administrator, so nothing in it can be changed.",
    },
    { status: 403 },
  );

/** Refuses `as` outright: writes act only as the signed-in member. */
export const mailWriter = async (
  req: NextRequest,
): Promise<MailScope | NextResponse> => {
  if (new URL(req.url).searchParams.has("as")) return viewOnly();
  return (await mailScope(req)) ?? unauthorized();
};
