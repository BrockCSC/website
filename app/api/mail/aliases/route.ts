import { NextResponse, type NextRequest } from "next/server";
import { requireMailAdmin } from "@/lib/auth/session";
import { ownsIdentities } from "@/lib/env";
import { badJson, jsonObject, notAuthorized } from "@/lib/json";
import { draftAlias, previewAlias, readAliases } from "@/lib/mail/aliases";
import { createMailingList } from "@/lib/mail/stalwart";

export const GET = async (req: NextRequest) => {
  if (!(await requireMailAdmin(req))) return notAuthorized();
  return NextResponse.json(await readAliases());
};

export const POST = async (req: NextRequest) => {
  if (!(await requireMailAdmin(req))) return notAuthorized();
  const body = await jsonObject<Record<string, unknown>>(req);
  if (!body) return badJson();

  const directory = await readAliases();
  const parsed = draftAlias(body, directory, null);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { draft } = parsed;

  if (!ownsIdentities()) {
    return NextResponse.json(
      { rehearsed: true, alias: previewAlias(directory, draft, "rehearsal") },
      { status: 201 },
    );
  }

  await createMailingList({ ...draft, domain: directory.domain });
  const alias = (await readAliases()).aliases.find(
    (one) => one.name === draft.name,
  );
  return NextResponse.json(alias, { status: 201 });
};
