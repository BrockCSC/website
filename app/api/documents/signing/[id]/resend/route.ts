import { NextResponse, type NextRequest } from "next/server";
import { requireApprover } from "@/lib/auth/session";
import { requestMeta } from "@/lib/documents/signer-routes";
import { resendSignerToken } from "@/lib/documents/signing";
import { badJson, jsonObject, notAuthorized } from "@/lib/json";

/** Approver-only and always immediate: re-sending an existing invite carries no more risk than the original send. */
export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const approver = await requireApprover(req);
  if (!approver) return notAuthorized();
  const { id } = await params;

  const body = await jsonObject<{ signerId?: string }>(req);
  if (!body?.signerId) return badJson();

  try {
    await resendSignerToken(id, body.signerId, {
      ...requestMeta(req),
      actorName: approver.name,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not resend." },
      { status: 409 },
    );
  }
};
