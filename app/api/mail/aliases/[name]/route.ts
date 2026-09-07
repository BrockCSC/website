import { NextResponse, type NextRequest } from "next/server";
import { requireMailAdmin } from "@/lib/auth/session";
import { ownsIdentities } from "@/lib/env";
import { badJson, jsonObject, notAuthorized, notFound } from "@/lib/json";
import {
  draftAlias,
  forgetAliasRoles,
  previewAlias,
  readAliases,
  setAliasRoles,
} from "@/lib/mail/aliases";
import { deleteMailingList, updateMailingList } from "@/lib/mail/stalwart";

type Params = { params: Promise<{ name: string }> };

const synced = (what: string) =>
  NextResponse.json(
    { error: `The co-presidents list ${what}. It follows Keycloak.` },
    { status: 409 },
  );

export const PATCH = async (req: NextRequest, { params }: Params) => {
  if (!(await requireMailAdmin(req))) return notAuthorized();
  const body = await jsonObject<Record<string, unknown>>(req);
  if (!body) return badJson();

  const { name } = await params;
  const directory = await readAliases();
  const existing = directory.aliases.find((one) => one.name === name);
  if (!existing) return notFound();
  if (existing.synced && body.recipients !== undefined) {
    return synced("chooses its own recipients");
  }

  const parsed = draftAlias(body, directory, existing);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { draft } = parsed;

  if (!ownsIdentities()) {
    return NextResponse.json({
      rehearsed: true,
      alias: previewAlias(directory, draft, existing.id),
    });
  }

  await updateMailingList(
    existing.id,
    {
      description: draft.description,
      aliases: draft.aliases,
      recipients: existing.synced ? undefined : draft.recipients,
    },
    directory.domain,
  );
  if (!existing.synced) await setAliasRoles(existing.name, draft.roles);
  const alias = (await readAliases()).aliases.find((one) => one.name === name);
  return NextResponse.json(alias);
};

export const DELETE = async (req: NextRequest, { params }: Params) => {
  if (!(await requireMailAdmin(req))) return notAuthorized();

  const { name } = await params;
  const { aliases, domain } = await readAliases();
  const existing = aliases.find((one) => one.name === name);
  if (!existing) return notFound();
  if (existing.synced) return synced("cannot be removed");
  const mine = new Set([
    existing.address,
    ...existing.aliases.map((one) => `${one}@${domain}`),
  ]);
  const holder = aliases.find((one) =>
    one.recipients.groups.some((group) => mine.has(group)),
  );
  if (holder) {
    return NextResponse.json(
      {
        error: `${holder.address} still delivers through it. Remove it there first.`,
      },
      { status: 409 },
    );
  }
  if (!ownsIdentities()) return NextResponse.json({ rehearsed: true });

  await deleteMailingList(existing.id);
  await forgetAliasRoles(existing.name);
  return new NextResponse(null, { status: 204 });
};
