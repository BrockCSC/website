import { NextResponse, type NextRequest } from "next/server";
import type { CancelSigningPayload } from "@/lib/api/types";
import { requireAdmin } from "@/lib/auth/session";
import { toWireRecord } from "@/lib/db/repository";
import { proposeOrApply } from "@/lib/documents/pending";
import {
  cancelSigningRequest,
  redactSigningRequest,
} from "@/lib/documents/signing";
import { notAuthorized } from "@/lib/json";

export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireAdmin(req);
  if (!user) return notAuthorized();
  const { id } = await params;
  const payload: CancelSigningPayload = { signingRequestId: id };

  try {
    const outcome = await proposeOrApply(
      user,
      "cancel-signing",
      payload,
      { signingRequestId: id },
      () => cancelSigningRequest(payload, { sub: user.sub, name: user.name }),
    );
    return outcome.applied
      ? NextResponse.json(toWireRecord(redactSigningRequest(outcome.result)))
      : NextResponse.json(
          { pending: toWireRecord(outcome.pending) },
          { status: 202 },
        );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not cancel." },
      { status: 409 },
    );
  }
};
