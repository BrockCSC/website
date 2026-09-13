import { NextResponse, type NextRequest } from "next/server";
import { requireApprover } from "@/lib/auth/session";
import { findSharedMailbox } from "@/lib/db/shared-mailboxes";
import { notAuthorized, notFound } from "@/lib/json";
import { deleteAppPassword } from "@/lib/mail/stalwart";

type Params = { params: Promise<{ username: string; id: string }> };

export const DELETE = async (req: NextRequest, { params }: Params) => {
  if (!(await requireApprover(req))) return notAuthorized();
  const { username, id } = await params;
  if (!(await findSharedMailbox(username))) return notFound();
  await deleteAppPassword(username, id);
  return new NextResponse(null, { status: 204 });
};
