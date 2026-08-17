import { NextResponse, type NextRequest } from "next/server";
import { requireApprover } from "@/lib/auth/session";
import { badJson, jsonObject, notAuthorized, notFound } from "@/lib/json";
import { applyConsequences, findPerson } from "../consequences";

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
  if (person.signup?.keycloakUserId === approver.sub) {
    return NextResponse.json(
      { error: "Another co-president has to review your own record." },
      { status: 409 },
    );
  }

  return NextResponse.json(await applyConsequences(person, apply));
};
