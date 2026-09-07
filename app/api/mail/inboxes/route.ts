import { NextResponse, type NextRequest } from "next/server";
import type { ExecRecord, SignupRecord } from "@/lib/api/types";
import { requireMailAdmin } from "@/lib/auth/session";
import { findAll } from "@/lib/db/repository";
import { execsTable, signupsTable } from "@/lib/db/schema";
import { notAuthorized } from "@/lib/json";
import { jmapResponses } from "@/lib/mail/jmap-mail";
import { isProtectedMailbox } from "@/lib/mail/provision";
import {
  adminAuthorization,
  chunked,
  listUsers,
  type MailUser,
} from "@/lib/mail/stalwart";

export type Inbox = {
  username: string;
  address: string;
  name: string;
  title?: string;
  readOnly: boolean;
  current: boolean;
  unread: number | null;
  total: number | null;
};

type Counts = { unread: number | null; total: number | null };
type InboxBox = {
  role: string | null;
  unreadEmails: number;
  totalEmails: number;
};

/** Null counts for an account whose call failed. */
const inboxCounts = async (users: MailUser[]): Promise<Map<string, Counts>> => {
  const responses = (
    await Promise.all(
      chunked(users).map((batch) =>
        jmapResponses(
          { authorization: adminAuthorization() },
          batch.map((user) => [
            "Mailbox/get",
            {
              accountId: user.id,
              ids: null,
              properties: ["role", "unreadEmails", "totalEmails"],
            },
            user.name,
          ]),
        ),
      ),
    )
  ).flat();
  return new Map(
    responses.map(([name, payload, id]) => {
      const inbox =
        name === "error"
          ? undefined
          : (payload as { list?: InboxBox[] }).list?.find(
              (box) => box.role === "inbox",
            );
      return [
        id,
        {
          unread: inbox?.unreadEmails ?? null,
          total: inbox?.totalEmails ?? null,
        },
      ];
    }),
  );
};

export const GET = async (req: NextRequest) => {
  if (!(await requireMailAdmin(req))) return notAuthorized();

  const [users, signups, execs] = await Promise.all([
    listUsers(),
    findAll<SignupRecord>(signupsTable),
    findAll<ExecRecord>(execsTable),
  ]);
  const listed = users.filter(
    (user) => user.name !== process.env.STALWART_ADMIN_USER,
  );
  const counts = await inboxCounts(listed);
  const execById = new Map(execs.map((exec) => [exec.id, exec]));
  const signupByUsername = new Map(
    signups
      .filter((signup) => signup.status === "approved" && signup.username)
      .map((signup) => [signup.username!, signup]),
  );

  const rank = (inbox: Inbox, known: boolean) =>
    inbox.current ? 0 : known && !isProtectedMailbox(inbox.username) ? 1 : 2;

  const inboxes = listed
    .map((user) => {
      const signup = signupByUsername.get(user.name);
      const exec = signup?.execKey ? execById.get(signup.execKey) : undefined;
      const inbox: Inbox = {
        username: user.name,
        address: user.emailAddress,
        name:
          exec?.name ||
          [signup?.firstName, signup?.lastName].filter(Boolean).join(" ") ||
          user.description ||
          user.name,
        title: exec?.title,
        readOnly: user.readOnly,
        current: exec?.isCurrentExec === true,
        ...(counts.get(user.name) ?? { unread: null, total: null }),
      };
      return { inbox, rank: rank(inbox, !!signup) };
    })
    .sort((a, b) => a.rank - b.rank || a.inbox.name.localeCompare(b.inbox.name))
    .map((entry) => entry.inbox);

  return NextResponse.json({ inboxes });
};
