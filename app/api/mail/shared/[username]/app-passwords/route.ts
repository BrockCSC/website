import { NextResponse, type NextRequest } from "next/server";
import { requireApprover } from "@/lib/auth/session";
import { findSharedMailbox } from "@/lib/db/shared-mailboxes";
import { badJson, jsonObject, notAuthorized, notFound } from "@/lib/json";
import { createAppPassword, listAppPasswords } from "@/lib/mail/stalwart";

const MAX_DESCRIPTION = 60;

type Params = { params: Promise<{ username: string }> };

/** Approver-scoped: unlike ownMailbox, the local part comes from the route. */
const guard = async (
  req: NextRequest,
  username: string,
): Promise<NextResponse | null> => {
  if (!(await requireApprover(req))) return notAuthorized();
  if (!(await findSharedMailbox(username))) return notFound();
  return null;
};

export const GET = async (req: NextRequest, { params }: Params) => {
  const { username } = await params;
  const denied = await guard(req, username);
  if (denied) return denied;
  return NextResponse.json(await listAppPasswords(username));
};

export const POST = async (req: NextRequest, { params }: Params) => {
  const { username } = await params;
  const denied = await guard(req, username);
  if (denied) return denied;

  const body = await jsonObject<{ description?: unknown }>(req);
  if (!body) return badJson();
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  if (!description || description.length > MAX_DESCRIPTION) {
    return NextResponse.json(
      { error: `Name it, in ${MAX_DESCRIPTION} characters or fewer.` },
      { status: 400 },
    );
  }

  const secret = await createAppPassword(username, description);
  if (!secret) {
    return NextResponse.json(
      { error: "The mail server would not create that." },
      { status: 502 },
    );
  }
  return NextResponse.json({ secret }, { status: 201 });
};
