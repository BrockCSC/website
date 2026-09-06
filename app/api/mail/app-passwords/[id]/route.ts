import { NextResponse, type NextRequest } from "next/server";
import { deleteAppPassword } from "@/lib/mail/stalwart";
import { ownMailbox } from "../mailbox";

export const DELETE = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const mailbox = await ownMailbox(req);
  if (mailbox instanceof NextResponse) return mailbox;

  const { id } = await params;
  await deleteAppPassword(mailbox, id);
  return new NextResponse(null, { status: 204 });
};
