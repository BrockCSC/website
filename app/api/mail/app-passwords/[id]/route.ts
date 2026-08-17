import { NextResponse, type NextRequest } from "next/server";
import { notAuthorized } from "@/lib/json";
import { deleteAppPassword } from "@/lib/mail/stalwart";
import { ownMailbox } from "../mailbox";

export const DELETE = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const mailbox = await ownMailbox(req);
  if (!mailbox) return notAuthorized();

  const { id } = await params;
  await deleteAppPassword(mailbox, id);
  return new NextResponse(null, { status: 204 });
};
