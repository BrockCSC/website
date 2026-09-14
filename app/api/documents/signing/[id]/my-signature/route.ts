import type { NextRequest } from "next/server";
import { requireMember } from "@/lib/auth/session";
import {
  findMemberSigner,
  signerSessionResponse,
  signerSignResponse,
} from "@/lib/documents/signer-routes";
import { notAuthorized, notFound } from "@/lib/json";

/** SignerSessionView for the signed-in member named on this request; the first call logs "viewed". */
export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireMember(req);
  if (!user) return notAuthorized();
  const { id } = await params;
  const lookup = await findMemberSigner(id, user.sub);
  if (!lookup) return notFound();
  return signerSessionResponse(req, lookup.request, lookup.signer, {
    kind: "member",
  });
};

/** SignSubmission -> SignResult. */
export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireMember(req);
  if (!user) return notAuthorized();
  const { id } = await params;
  const lookup = await findMemberSigner(id, user.sub);
  if (!lookup) return notFound();
  return signerSignResponse(req, lookup.request, lookup.signer, {
    kind: "member",
  });
};
