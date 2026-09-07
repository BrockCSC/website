import type { ExecRecord, SignupRecord } from "@/lib/api/types";
import { findAll } from "@/lib/db/repository";
import { execsTable, signupsTable } from "@/lib/db/schema";
import { dailyLimitFor } from "./limit";
import { isProtectedMailbox } from "./provision";
import { adminAuthorization, chunked, listUsers } from "./stalwart";

export type MailUsage = {
  days: number;
  accounts: {
    username: string;
    name: string;
    sent: number;
    received: number;
    dailyLimit: number;
    exempt: boolean;
    readOnly: boolean;
  }[];
  totals: { sent: number; received: number; dailyCap: number };
};

type Call = [string, Record<string, unknown>, string];

const post = async (calls: Call[]): Promise<Call[]> => {
  const { STALWART_URL } = process.env;
  if (!STALWART_URL) throw new Error("STALWART_URL env var is not set.");
  const res = await fetch(`${STALWART_URL.replace(/\/$/, "")}/jmap`, {
    method: "POST",
    headers: {
      authorization: adminAuthorization(),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      methodCalls: calls,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Stalwart JMAP failed (${res.status}): ${(await res.text()).slice(0, 300)}`,
    );
  }
  return ((await res.json()) as { methodResponses: Call[] }).methodResponses;
};

/** Responses keyed by call id; a per-call error is left out. */
const jmap = async (calls: Call[]): Promise<Map<string, unknown>> => {
  const responses: Call[] = [];
  for (const batch of chunked(calls)) responses.push(...(await post(batch)));
  return new Map(
    responses
      .filter(([name]) => name !== "error")
      .map(([, payload, id]) => [id, payload]),
  );
};

export const clubMailUsage = async (days: number): Promise<MailUsage> => {
  const [mailboxes, signups, execs] = await Promise.all([
    listUsers(),
    findAll<SignupRecord>(signupsTable),
    findAll<ExecRecord>(execsTable),
  ]);
  const users = mailboxes.filter(
    (user) => user.name !== process.env.STALWART_ADMIN_USER,
  );
  const signupOf = new Map(signups.map((signup) => [signup.username, signup]));
  const execOf = new Map(execs.map((exec) => [exec.id, exec]));
  const after = new Date(Date.now() - days * 86_400_000).toISOString();

  const boxes = await jmap(
    users.map((user) => [
      "Mailbox/get",
      { accountId: user.id, ids: null, properties: ["id", "role"] },
      user.name,
    ]),
  );
  const queries: Call[] = [];
  for (const user of users) {
    const list =
      (boxes.get(user.name) as { list: { id: string; role: string | null }[] })
        ?.list ?? [];
    for (const [key, role] of [
      ["sent", "sent"],
      ["received", "inbox"],
    ]) {
      const box = list.find((one) => one.role === role);
      if (box) {
        queries.push([
          "Email/query",
          {
            accountId: user.id,
            filter: { inMailbox: box.id, after },
            limit: 1,
            calculateTotal: true,
          },
          `${user.name}:${key}`,
        ]);
      }
    }
  }
  const counts = queries.length ? await jmap(queries) : new Map();
  const total = (id: string) =>
    (counts.get(id) as { total?: number } | undefined)?.total ?? 0;

  const accounts = users.map((user) => {
    const signup = signupOf.get(user.name) ?? null;
    return {
      username: user.name,
      name:
        (signup?.execKey && execOf.get(signup.execKey)?.name) ||
        user.description ||
        user.name,
      sent: total(`${user.name}:sent`),
      received: total(`${user.name}:received`),
      dailyLimit: dailyLimitFor(signup),
      exempt: isProtectedMailbox(user.name),
      readOnly: user.readOnly,
    };
  });

  return {
    days,
    accounts,
    totals: accounts.reduce(
      (sum, account) => ({
        sent: sum.sent + account.sent,
        received: sum.received + account.received,
        dailyCap:
          sum.dailyCap +
          (account.exempt || account.readOnly ? 0 : account.dailyLimit),
      }),
      { sent: 0, received: 0, dailyCap: 0 },
    ),
  };
};
