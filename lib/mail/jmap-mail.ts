/** Read-only JMAP mail client (RFC 8620 core, RFC 8621 mail). Every call acts
 * as the signed-in user via their Keycloak access token; Stalwart's OIDC
 * directory resolves it to that user's account and enforces isolation. */

const CAPABILITIES = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"];

const MAIL_CAPABILITY = "urn:ietf:params:jmap:mail";

const config = () => {
  const { STALWART_URL } = process.env;
  if (!STALWART_URL) throw new Error("STALWART_URL env var is not set.");
  return { url: STALWART_URL.replace(/\/$/, "") };
};

export type EmailAddress = { name: string | null; email: string };

export type Mailbox = {
  id: string;
  name: string;
  role: string | null;
  totalEmails: number;
  unreadEmails: number;
};

export type MessageSummary = {
  id: string;
  threadId: string;
  subject: string | null;
  from: EmailAddress[] | null;
  to: EmailAddress[] | null;
  receivedAt: string;
  preview: string;
  hasAttachment: boolean;
  keywords: Record<string, boolean>;
};

export type BodyPart = {
  partId: string | null;
  blobId: string | null;
  size: number;
  name: string | null;
  type: string;
  charset: string | null;
  disposition: string | null;
  cid: string | null;
};

export type MessageDetail = MessageSummary & {
  mailboxIds: Record<string, boolean>;
  cc: EmailAddress[] | null;
  bcc: EmailAddress[] | null;
  replyTo: EmailAddress[] | null;
  sentAt: string | null;
  size: number;
  headers: { name: string; value: string }[];
  bodyValues: Record<
    string,
    { value: string; isEncodingProblem: boolean; isTruncated: boolean }
  >;
  htmlBody: BodyPart[];
  textBody: BodyPart[];
  attachments: BodyPart[];
};

type Call = [string, Record<string, unknown>, string];

const jmap = async (token: string, calls: Call[]): Promise<unknown[]> => {
  const { url } = config();
  const res = await fetch(`${url}/jmap`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ using: CAPABILITIES, methodCalls: calls }),
  });
  if (!res.ok) throw new Error(`Stalwart JMAP failed (${res.status}).`);

  const body = (await res.json()) as { methodResponses: Call[] };
  return body.methodResponses.map(([name, payload]) => {
    if (name === "error") {
      throw new Error(`Stalwart rejected the call: ${JSON.stringify(payload)}`);
    }
    return payload;
  });
};

/** The token alone decides the account; never take an accountId from a caller. */
export const mailAccountId = async (token: string): Promise<string> => {
  const { url } = config();
  const res = await fetch(`${url}/jmap/session`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Stalwart JMAP session failed (${res.status}).`);

  const session = (await res.json()) as {
    primaryAccounts?: Record<string, string>;
  };
  const accountId = session.primaryAccounts?.[MAIL_CAPABILITY];
  if (!accountId) throw new Error("Stalwart session has no mail account.");
  return accountId;
};

export const listMailboxes = async (token: string): Promise<Mailbox[]> => {
  const accountId = await mailAccountId(token);
  const [res] = (await jmap(token, [
    [
      "Mailbox/get",
      {
        accountId,
        ids: null,
        properties: ["id", "name", "role", "totalEmails", "unreadEmails"],
      },
      "m0",
    ],
  ])) as [{ list: Mailbox[] }];

  return res.list.sort(
    (a, b) =>
      Number(b.role === "inbox") - Number(a.role === "inbox") ||
      a.name.localeCompare(b.name),
  );
};

export const listMessages = async (
  token: string,
  opts: { mailboxId: string; limit?: number; position?: number },
): Promise<{ messages: MessageSummary[]; total: number }> => {
  const accountId = await mailAccountId(token);
  const [query, get] = (await jmap(token, [
    [
      "Email/query",
      {
        accountId,
        filter: { inMailbox: opts.mailboxId },
        sort: [{ property: "receivedAt", isAscending: false }],
        position: opts.position ?? 0,
        limit: opts.limit ?? 50,
        calculateTotal: true,
      },
      "q0",
    ],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "q0", name: "Email/query", path: "/ids" },
        properties: [
          "id",
          "threadId",
          "subject",
          "from",
          "to",
          "receivedAt",
          "preview",
          "hasAttachment",
          "keywords",
        ],
      },
      "g0",
    ],
  ])) as [{ ids: string[]; total: number }, { list: MessageSummary[] }];

  // /get may answer in any order, so the query ids carry the sort.
  const byId = new Map(get.list.map((message) => [message.id, message]));
  return {
    messages: query.ids.flatMap((id) => byId.get(id) ?? []),
    total: query.total,
  };
};

export const getMessage = async (
  token: string,
  id: string,
): Promise<MessageDetail> => {
  const accountId = await mailAccountId(token);
  const [res] = (await jmap(token, [
    [
      "Email/get",
      {
        accountId,
        ids: [id],
        properties: [
          "id",
          "threadId",
          "mailboxIds",
          "subject",
          "from",
          "to",
          "cc",
          "bcc",
          "replyTo",
          "sentAt",
          "receivedAt",
          "size",
          "preview",
          "hasAttachment",
          "keywords",
          "headers",
          "bodyValues",
          "htmlBody",
          "textBody",
          "attachments",
        ],
        fetchHTMLBodyValues: true,
        fetchTextBodyValues: true,
        maxBodyValueBytes: 500_000,
      },
      "g0",
    ],
  ])) as [{ list: MessageDetail[] }];

  const message = res.list[0];
  if (!message) throw new Error(`No message ${id} in this account.`);
  return message;
};
