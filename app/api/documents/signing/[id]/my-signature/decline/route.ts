import type { NextRequest } from "next/server";
import { requireMember } from "@/lib/auth/session";
import {
  findMemberSigner,
  signerDeclineResponse,
} from "@/lib/documents/signer-routes";
import { notAuthorized, notFound } from "@/lib/json";

export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireMember(req);
  if (!user) return notAuthorized();
  const { id } = await params;
  const lookup = await findMemberSigner(id, user.sub);
  if (!lookup) return notFound();
  return signerDeclineResponse(req, lookup.request, lookup.signer);
};
