import { NextResponse, type NextRequest } from "next/server";
import { requireApprover } from "@/lib/auth/session";
import { findSharedMailbox } from "@/lib/db/shared-mailboxes";
import { remove, update } from "@/lib/db/repository";
import { sharedMailboxesTable } from "@/lib/db/schema";
import { ownsIdentities } from "@/lib/env";
import { badJson, jsonObject, notAuthorized, notFound } from "@/lib/json";
import { deleteApprovedSender } from "@/lib/mail/oci-senders";
import { domain } from "@/lib/mail/provision";
import {
  LOCAL_PART_RE,
  parseDailyLimit,
  validateAliases,
} from "@/lib/mail/shared-mailboxes";
import {
  accountAliases,
  destroyAccount,
  revokeAppPasswords,
  setAccountAliases,
  setDescription,
} from "@/lib/mail/stalwart";

const MAX_DESCRIPTION = 200;

type Params = { params: Promise<{ username: string }> };

export const PATCH = async (req: NextRequest, { params }: Params) => {
  if (!(await requireApprover(req))) return notAuthorized();
  const { username } = await params;
  if (!LOCAL_PART_RE.test(username)) return notFound();
  const row = await findSharedMailbox(username);
  if (!row) return notFound();

  const body = await jsonObject<{
    description?: unknown;
    aliases?: unknown;
    mailDailyLimit?: unknown;
  }>(req);
  if (!body) return badJson();

  let description: string | undefined;
  if (body.description !== undefined) {
    if (
      typeof body.description !== "string" ||
      body.description.trim().length > MAX_DESCRIPTION
    ) {
      return NextResponse.json(
        { error: `Describe it in ${MAX_DESCRIPTION} characters or fewer.` },
        { status: 400 },
      );
    }
    description = body.description.trim();
  }

  let aliases: string[] | undefined;
  if (body.aliases !== undefined) {
    const current = await accountAliases(username);
    const validated = await validateAliases(body.aliases, current);
    if ("error" in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    aliases = validated.aliases;
  }

  const mailDailyLimit = parseDailyLimit(body.mailDailyLimit);
  if (mailDailyLimit === null) {
    return NextResponse.json(
      { error: "The daily limit must be a positive number." },
      { status: 400 },
    );
  }

  if (ownsIdentities()) {
    if (description !== undefined) await setDescription(username, description);
    if (aliases !== undefined)
      await setAccountAliases(username, aliases, domain());
  }
  if (mailDailyLimit !== undefined) {
    await update(sharedMailboxesTable, row.id, { mailDailyLimit });
  }

  return NextResponse.json({ rehearsed: ownsIdentities() ? undefined : true });
};

export const DELETE = async (req: NextRequest, { params }: Params) => {
  if (!(await requireApprover(req))) return notAuthorized();
  const { username } = await params;
  if (!LOCAL_PART_RE.test(username)) return notFound();
  const row = await findSharedMailbox(username);
  if (!row) return notFound();

  if (!ownsIdentities()) {
    await remove(sharedMailboxesTable, row.id);
    return NextResponse.json({ rehearsed: true });
  }

  await revokeAppPasswords(username);
  await deleteApprovedSender(`${username}@${domain()}`);
  await destroyAccount(username);
  await remove(sharedMailboxesTable, row.id);

  return new NextResponse(null, { status: 204 });
};
