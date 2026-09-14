import { NextResponse, type NextRequest } from "next/server";
import type { SharedMailboxRecord, SignupRecord } from "@/lib/api/types";
import { requireApprover } from "@/lib/auth/session";
import { create, findAll } from "@/lib/db/repository";
import { sharedMailboxesTable, signupsTable } from "@/lib/db/schema";
import { listSharedMailboxes } from "@/lib/db/shared-mailboxes";
import { ownsIdentities } from "@/lib/env";
import { badJson, jsonObject, notAuthorized } from "@/lib/json";
import { inboxCounts } from "@/lib/mail/inbox-counts";
import { createApprovedSender } from "@/lib/mail/oci-senders";
import { domain } from "@/lib/mail/provision";
import {
  parseDailyLimit,
  validateNewLocalPart,
} from "@/lib/mail/shared-mailboxes";
import {
  accountAliases,
  createMailbox,
  listUsers,
  type MailUser,
} from "@/lib/mail/stalwart";

const MAX_DESCRIPTION = 200;

export type SharedMailbox = {
  username: string;
  address: string;
  createdBy: string;
  createdAt: string;
  mailDailyLimit?: number;
  description: string;
  aliases: string[];
  provisioned: boolean;
  readOnly: boolean;
  unread: number | null;
  total: number | null;
};

/**
 * Mailboxes created before this table existed (security@, from
 * lib/mail/system-mail.ts) have no row here. Back-fill one on first sight so
 * they become visible and manageable instead of staying invisible forever.
 */
const adoptUntracked = async (
  users: MailUser[],
  tracked: Set<string>,
): Promise<void> => {
  const signups = await findAll<SignupRecord>(signupsTable);
  const hasSignup = new Set(
    signups.filter((s) => s.username).map((s) => s.username),
  );
  const orphans = users.filter(
    (user) =>
      user.name !== process.env.STALWART_ADMIN_USER &&
      !hasSignup.has(user.name) &&
      !tracked.has(user.name),
  );
  for (const orphan of orphans) {
    await create<SharedMailboxRecord>(sharedMailboxesTable, {
      username: orphan.name,
      createdBy: "detected automatically",
      createdAt: new Date().toISOString(),
    });
  }
};

export const GET = async (req: NextRequest) => {
  if (!(await requireApprover(req))) return notAuthorized();

  let rows = await listSharedMailboxes();
  const users = await listUsers();
  await adoptUntracked(users, new Set(rows.map((row) => row.username)));
  rows = await listSharedMailboxes();
  const byName = new Map(users.map((user) => [user.name, user]));
  const matched = rows
    .map((row) => byName.get(row.username))
    .filter((user): user is MailUser => !!user);

  const [aliasLists, counts] = await Promise.all([
    Promise.all(rows.map((row) => accountAliases(row.username))),
    inboxCounts(matched),
  ]);

  const mailboxes: SharedMailbox[] = rows.map((row, i) => {
    const user = byName.get(row.username);
    const count = user
      ? (counts.get(user.name) ?? { unread: null, total: null })
      : { unread: null, total: null };
    return {
      username: row.username,
      address: `${row.username}@${domain()}`,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      mailDailyLimit: row.mailDailyLimit,
      description: user?.description ?? "",
      aliases: aliasLists[i],
      provisioned: !!user,
      readOnly: user?.readOnly ?? false,
      ...count,
    };
  });

  return NextResponse.json({
    mailboxes,
    domain: domain(),
    identitiesEditable: ownsIdentities(),
  });
};

export const POST = async (req: NextRequest) => {
  const approver = await requireApprover(req);
  if (!approver) return notAuthorized();

  const body = await jsonObject<{
    username?: unknown;
    description?: unknown;
    mailDailyLimit?: unknown;
  }>(req);
  if (!body) return badJson();

  const validated = await validateNewLocalPart(body.username);
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const { name: username } = validated;

  const description =
    body.description === undefined
      ? username
      : typeof body.description === "string"
        ? body.description.trim()
        : null;
  if (description === null || description.length > MAX_DESCRIPTION) {
    return NextResponse.json(
      { error: `Describe it in ${MAX_DESCRIPTION} characters or fewer.` },
      { status: 400 },
    );
  }

  const mailDailyLimit = parseDailyLimit(body.mailDailyLimit);
  if (mailDailyLimit === null) {
    return NextResponse.json(
      { error: "The daily limit must be a positive number." },
      { status: 400 },
    );
  }

  if (ownsIdentities()) {
    await createMailbox({
      localPart: username,
      displayName: description,
      domain: domain(),
    });
    await createApprovedSender(`${username}@${domain()}`);
  }

  await create<SharedMailboxRecord>(sharedMailboxesTable, {
    username,
    createdBy: approver.email || approver.name,
    createdAt: new Date().toISOString(),
    ...(mailDailyLimit !== undefined ? { mailDailyLimit } : {}),
  });

  return NextResponse.json(
    { username, rehearsed: ownsIdentities() ? undefined : true },
    { status: 201 },
  );
};
