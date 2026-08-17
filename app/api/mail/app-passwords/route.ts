import { NextResponse, type NextRequest } from "next/server";
import { badJson, jsonObject, notAuthorized } from "@/lib/json";
import { createAppPassword, listAppPasswords } from "@/lib/mail/stalwart";
import { ownMailbox } from "./mailbox";

const MAX_DESCRIPTION = 60;

export const GET = async (req: NextRequest) => {
  const mailbox = await ownMailbox(req);
  if (!mailbox) return notAuthorized();
  return NextResponse.json(await listAppPasswords(mailbox));
};

export const POST = async (req: NextRequest) => {
  const mailbox = await ownMailbox(req);
  if (!mailbox) return notAuthorized();

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

  const secret = await createAppPassword(mailbox, description);
  if (!secret) {
    return NextResponse.json(
      { error: "The mail server would not create that." },
      { status: 502 },
    );
  }
  return NextResponse.json({ secret }, { status: 201 });
};
