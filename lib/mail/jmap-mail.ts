/** JMAP mail client (RFC 8620 core, RFC 8621 mail and submission). Every call acts
 * as the signed-in user via their Keycloak access token; Stalwart's OIDC
 * directory resolves it to that user's account and enforces isolation. */

import {
  htmlSignature,
  signerFor,
  textSignature,
  withFooter,
  type Signer,
} from "./signature";

const CAPABILITIES = [
  "urn:ietf:params:jmap:core",
  "urn:ietf:params:jmap:mail",
  "urn:ietf:params:jmap:submission",
];

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

type Session = {
  primaryAccounts?: Record<string, string>;
  username?: string;
  accounts?: Record<string, { name?: string }>;
};

/** The token alone decides the account; never take an accountId from a caller. */
const mailSession = async (
  token: string,
): Promise<{ session: Session; accountId: string }> => {
  const { url } = config();
  const res = await fetch(`${url}/jmap/session`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Stalwart JMAP session failed (${res.status}).`);

  const session = (await res.json()) as Session;
  const accountId = session.primaryAccounts?.[MAIL_CAPABILITY];
  if (!accountId) throw new Error("Stalwart session has no mail account.");
  return { session, accountId };
};

export const mailAccountId = async (token: string): Promise<string> =>
  (await mailSession(token)).accountId;

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

/** The address this account sends from, or null when it has no mailbox. */
export const sendingAddress = async (token: string): Promise<string | null> => {
  const { session, accountId } = await mailSession(token);
  const [identities] = (await jmap(token, [
    [
      "Identity/get",
      { accountId, ids: null, properties: ["id", "email"] },
      "i0",
    ],
  ])) as [{ list: Identity[] }];
  if (identities.list.length === 0) return null;
  return senderIdentity(session, accountId, identities.list).email;
};

export type OutgoingMessage = {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
};

type Identity = {
  id: string;
  email: string;
  textSignature?: string;
  htmlSignature?: string;
};

const ownName = (session: Session, accountId: string) =>
  session.accounts?.[accountId]?.name ?? session.username;

/** Identities are Stalwart's own addresses for the account, aliases included,
 * so the sender can never be someone else's. Prefer the one the session names
 * as the account over an alias. */
const senderIdentity = (
  session: Session,
  accountId: string,
  list: Identity[],
): Identity => {
  const own = ownName(session, accountId);
  const match =
    list.find((i) => i.email === own || i.email.split("@")[0] === own) ??
    list[0];
  if (!match) throw new Error("This account has no sender address.");
  return match;
};

/**
 * Keeps the account's own Identity carrying the current signature. Stalwart
 * materialises Identity objects lazily from the account's addresses, so there
 * is nothing to write at provisioning time; reconciling here, as the user, also
 * picks up a later title change. Best effort: a signature must never block a
 * send.
 */
const refreshSignature = async (
  token: string,
  accountId: string,
  identity: Identity,
  signer: Signer | null,
): Promise<void> => {
  if (!signer) return;
  const wanted = {
    textSignature: textSignature(signer),
    htmlSignature: htmlSignature(signer),
  };
  if (
    identity.textSignature === wanted.textSignature &&
    identity.htmlSignature === wanted.htmlSignature
  ) {
    return;
  }
  await jmap(token, [
    ["Identity/set", { accountId, update: { [identity.id]: wanted } }, "d0"],
  ]).catch(() => {});
};

/** Drafts and submits in one request; onSuccessUpdateEmail refiles into Sent
 * only once the send succeeds. */
export const sendMessage = async (
  token: string,
  msg: OutgoingMessage,
): Promise<string> => {
  const { session, accountId } = await mailSession(token);
  const [identities, mailboxes] = (await jmap(token, [
    [
      "Identity/get",
      {
        accountId,
        ids: null,
        properties: ["id", "email", "textSignature", "htmlSignature"],
      },
      "i0",
    ],
    ["Mailbox/get", { accountId, ids: null, properties: ["id", "role"] }, "m0"],
  ])) as [
    { list: Identity[] },
    { list: { id: string; role: string | null }[] },
  ];

  // Names are localised; the role is the stable handle.
  const drafts = mailboxes.list.find((box) => box.role === "drafts");
  const sent = mailboxes.list.find((box) => box.role === "sent");
  if (!drafts || !sent) {
    throw new Error("This account has no drafts or sent mailbox.");
  }

  const identity = senderIdentity(session, accountId, identities.list);
  const signer = await signerFor(ownName(session, accountId) ?? "");
  await refreshSignature(token, accountId, identity, signer);

  const [draft, submission] = (await jmap(token, [
    [
      "Email/set",
      {
        accountId,
        create: {
          draft: {
            mailboxIds: { [drafts.id]: true },
            keywords: { $draft: true },
            from: [{ email: identity.email }],
            to: msg.to.map((email) => ({ email })),
            ...(msg.cc?.length
              ? { cc: msg.cc.map((email) => ({ email })) }
              : {}),
            subject: msg.subject,
            bodyValues: { body: { value: withFooter(msg.text, signer) } },
            textBody: [{ partId: "body", type: "text/plain" }],
          },
        },
      },
      "c0",
    ],
    [
      "EmailSubmission/set",
      {
        accountId,
        create: {
          submission: { identityId: identity.id, emailId: "#draft" },
        },
        onSuccessUpdateEmail: {
          "#submission": {
            "keywords/$draft": null,
            [`mailboxIds/${drafts.id}`]: null,
            [`mailboxIds/${sent.id}`]: true,
          },
        },
      },
      "s0",
    ],
  ])) as [
    { created?: Record<string, { id: string }>; notCreated?: unknown },
    { created?: Record<string, unknown>; notCreated?: unknown },
  ];

  const created = draft.created?.draft;
  if (!created) {
    throw new Error(
      `Stalwart refused the message: ${JSON.stringify(draft.notCreated)}`,
    );
  }
  if (!submission.created?.submission) {
    throw new Error(
      `Stalwart refused to send: ${JSON.stringify(submission.notCreated)}`,
    );
  }
  return created.id;
};
