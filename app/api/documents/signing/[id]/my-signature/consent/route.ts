import type { NextRequest } from "next/server";
import { requireMember } from "@/lib/auth/session";
import {
  findMemberSigner,
  signerConsentResponse,
} from "@/lib/documents/signer-routes";
import { notAuthorized, notFound } from "@/lib/json";

/** Accepts the e-sign disclosure. Idempotent. */
export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireMember(req);
  if (!user) return notAuthorized();
  const { id } = await params;
  const lookup = await findMemberSigner(id, user.sub);
  if (!lookup) return notFound();
  return signerConsentResponse(req, lookup.request, lookup.signer);
};
