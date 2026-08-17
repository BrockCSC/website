import { NextResponse, type NextRequest } from "next/server";
import { requireApprover } from "@/lib/auth/session";
import { badJson, jsonObject, notAuthorized, notFound } from "@/lib/json";
import { applyConsequences, findPerson } from "../consequences";
import { isSelfReview, selfReviewRefused } from "../review";

export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const approver = await requireApprover(req);
  if (!approver) return notAuthorized();

  const body = await jsonObject<{ apply?: unknown }>(req);
  if (!body) return badJson();
  const apply = Array.isArray(body.apply)
    ? body.apply.filter((id): id is string => typeof id === "string")
    : null;
  if (!apply?.length) {
    return NextResponse.json({ error: "Nothing to apply." }, { status: 400 });
  }

  const { id } = await params;
  const person = await findPerson(id);
  if (!person) return notFound();
  if (isSelfReview(approver, person.signup?.keycloakUserId))
    return selfReviewRefused("record");

  return NextResponse.json(await applyConsequences(person, apply));
};
