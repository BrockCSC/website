import { NextResponse, type NextRequest } from "next/server";
import { requireApprover } from "@/lib/auth/session";
import { toWireRecord } from "@/lib/db/repository";
import { listPendingActions } from "@/lib/documents/pending";
import { notAuthorized } from "@/lib/json";

export const GET = async (req: NextRequest) => {
  const approver = await requireApprover(req);
  if (!approver) return notAuthorized();
  const pending = await listPendingActions();
  return NextResponse.json(pending.map(toWireRecord));
};
