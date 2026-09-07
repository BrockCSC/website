import { NextResponse, type NextRequest } from "next/server";
import { requireMailAdmin } from "@/lib/auth/session";
import { ownsIdentities } from "@/lib/env";
import { badJson, jsonObject, notAuthorized } from "@/lib/json";
import { readAliases } from "@/lib/mail/aliases";
import { syncMailRouting } from "@/lib/mail/provision";
import { writeMailSettings } from "@/lib/mail/settings";

export const PUT = async (req: NextRequest) => {
  if (!(await requireMailAdmin(req))) return notAuthorized();

  const body = await jsonObject<{ forwardTo?: unknown; off?: unknown }>(req);
  if (!body) return badJson();

  const forwardTo =
    typeof body.forwardTo === "string" && body.forwardTo.trim()
      ? body.forwardTo.trim().toLowerCase()
      : null;
  const off =
    body.off === undefined
      ? undefined
      : Array.isArray(body.off) &&
          body.off.every((one) => typeof one === "string")
        ? [...new Set((body.off as string[]).map((one) => one.toLowerCase()))]
        : null;
  if (off === null) return badJson();

  const directory = await readAliases();
  if (forwardTo) {
    const known = [
      ...directory.aliases.flatMap((alias) => [
        alias.address,
        ...alias.aliases.map((one) => `${one}@${directory.domain}`),
      ]),
      ...directory.people.map((person) => person.address),
    ];
    if (!known.includes(forwardTo)) {
      return NextResponse.json(
        { error: "Read-only mail can only be copied to a club address." },
        { status: 400 },
      );
    }
  }

  if (!ownsIdentities()) {
    return NextResponse.json({ rehearsed: true, forwardTo, off });
  }
  const settings = await writeMailSettings({
    forwardTo,
    ...(off === undefined ? {} : { forwardingOff: off }),
  });
  await syncMailRouting();
  return NextResponse.json(settings);
};
