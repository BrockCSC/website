import { NextResponse, type NextRequest } from "next/server";
import { requireMailAdmin } from "@/lib/auth/session";
import { ownsIdentities } from "@/lib/env";
import { badJson, jsonObject, notAuthorized } from "@/lib/json";
import { readAliases } from "@/lib/mail/aliases";
import { domain } from "@/lib/mail/provision";
import { setCatchAll } from "@/lib/mail/stalwart";

export const PUT = async (req: NextRequest) => {
  if (!(await requireMailAdmin(req))) return notAuthorized();

  const body = await jsonObject<{ address?: unknown }>(req);
  if (!body) return badJson();
  const address =
    typeof body.address === "string" && body.address.trim()
      ? body.address.trim().toLowerCase()
      : null;

  if (address) {
    const directory = await readAliases();
    const known = [
      ...directory.aliases.flatMap((alias) => [
        alias.address,
        ...alias.aliases,
      ]),
      ...directory.people.map((person) => person.address),
    ];
    if (!known.includes(address)) {
      return NextResponse.json(
        { error: "Unaddressed mail can only go to a club address." },
        { status: 400 },
      );
    }
  }

  if (!ownsIdentities()) return NextResponse.json({ rehearsed: true, address });
  await setCatchAll(domain(), address);
  return NextResponse.json({ address });
};
