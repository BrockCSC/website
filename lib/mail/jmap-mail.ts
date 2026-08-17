/** JMAP mail client (RFC 8620 core, RFC 8621 mail and submission). Every call acts
 * as the signed-in user via their Keycloak access token; Stalwart's OIDC
 * directory resolves it to that user's account and enforces isolation. */

import { sanitizeOutboundHtml } from "./sanitize";
import {
  htmlSignature,
  signerFor,
  textSignature,
  withFooter,
  withHtmlFooter,
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
  mailboxIds?: Record<string, boolean>;
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
  downloadUrl?: string;
  uploadUrl?: string;
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

const SUMMARY_PROPERTIES = [
  "id",
  "threadId",
  "mailboxIds",
  "subject",
  "from",
  "to",
  "receivedAt",
  "preview",
  "hasAttachment",
  "keywords",
];

export type MessageQuery = {
  mailboxId?: string;
  search?: string;
  limit?: number;
  position?: number;
  threaded?: boolean;
};

export type MessagePage = {
  messages: MessageSummary[];
  total: number;
  threadCounts: Record<string, number>;
};

/** Text search is handed to the server so it covers the folder, not the page. */
const messageFilter = (opts: MessageQuery) => {
  const conditions = [
    ...(opts.mailboxId ? [{ inMailbox: opts.mailboxId }] : []),
    ...(opts.search?.trim() ? [{ text: opts.search.trim() }] : []),
  ];
  if (conditions.length === 0) return undefined;
  return conditions.length === 1
    ? conditions[0]
    : { operator: "AND", conditions };
};

const queryMessages = async (
  token: string,
  accountId: string,
  opts: MessageQuery,
  threaded: boolean,
): Promise<MessagePage> => {
  const calls: Call[] = [
    [
      "Email/query",
      {
        accountId,
        filter: messageFilter(opts),
        sort: [{ property: "receivedAt", isAscending: false }],
        position: opts.position ?? 0,
        limit: opts.limit ?? 50,
        calculateTotal: true,
        ...(threaded ? { collapseThreads: true } : {}),
      },
      "q0",
    ],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "q0", name: "Email/query", path: "/ids" },
        properties: SUMMARY_PROPERTIES,
      },
      "g0",
    ],
    ...(threaded
      ? ([
          [
            "Thread/get",
            {
              accountId,
              "#ids": {
                resultOf: "g0",
                name: "Email/get",
                path: "/list/*/threadId",
              },
              properties: ["id", "emailIds"],
            },
            "t0",
          ],
        ] as Call[])
      : []),
  ];

  const [query, get, threads] = (await jmap(token, calls)) as [
    { ids: string[]; total: number },
    { list: MessageSummary[] },
    { list: { id: string; emailIds: string[] }[] } | undefined,
  ];

  // /get may answer in any order, so the query ids carry the sort.
  const byId = new Map(get.list.map((message) => [message.id, message]));
  return {
    messages: query.ids.flatMap((id) => byId.get(id) ?? []),
    total: query.total,
    threadCounts: Object.fromEntries(
      (threads?.list ?? []).map((thread) => [
        thread.id,
        thread.emailIds.length,
      ]),
    ),
  };
};

export const listMessages = async (
  token: string,
  opts: MessageQuery,
): Promise<MessagePage> => {
  const accountId = await mailAccountId(token);
  if (!opts.threaded) return queryMessages(token, accountId, opts, false);
  // collapseThreads is optional in RFC 8621; fall back to a flat list.
  return queryMessages(token, accountId, opts, true).catch(() =>
    queryMessages(token, accountId, opts, false),
  );
};

export const getThread = async (
  token: string,
  threadId: string,
): Promise<MessageSummary[]> => {
  const accountId = await mailAccountId(token);
  const [, get] = (await jmap(token, [
    ["Thread/get", { accountId, ids: [threadId] }, "t0"],
    [
      "Email/get",
      {
        accountId,
        "#ids": {
          resultOf: "t0",
          name: "Thread/get",
          path: "/list/*/emailIds",
        },
        properties: SUMMARY_PROPERTIES,
      },
      "g0",
    ],
  ])) as [unknown, { list: MessageSummary[] }];

  return get.list.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
};

/** A false value clears the keyword; JMAP patches take null for "remove". */
export const setKeywords = async (
  token: string,
  ids: string[],
  keywords: Record<string, boolean>,
): Promise<void> => {
  const accountId = await mailAccountId(token);
  const patch = Object.fromEntries(
    Object.entries(keywords).map(([name, on]) => [
      `keywords/${name}`,
      on ? true : null,
    ]),
  );
  const [res] = (await jmap(token, [
    [
      "Email/set",
      { accountId, update: Object.fromEntries(ids.map((id) => [id, patch])) },
      "e0",
    ],
  ])) as [{ notUpdated?: Record<string, unknown> }];

  if (res.notUpdated && Object.keys(res.notUpdated).length > 0) {
    throw new Error(
      `Stalwart refused the flag change: ${JSON.stringify(res.notUpdated)}`,
    );
  }
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

/**
 * Moves messages wholesale, replacing their mailboxes rather than adding one.
 * Stalwart ships no Archive folder, so it is created on first use; Trash always
 * exists. Nothing is erased here: every move is reversible from the folder.
 */
export const moveMessages = async (
  token: string,
  ids: string[],
  to: { role?: "trash" | "archive"; mailboxId?: string },
): Promise<void> => {
  const accountId = await mailAccountId(token);
  const [boxes] = (await jmap(token, [
    ["Mailbox/get", { accountId, ids: null, properties: ["id", "role"] }, "m0"],
  ])) as [{ list: { id: string; role: string | null }[] }];

  // Only ids the account actually owns: a client may not name a stranger's box.
  let target = to.mailboxId
    ? boxes.list.find((box) => box.id === to.mailboxId)?.id
    : boxes.list.find((box) => box.role === to.role)?.id;

  if (!target && to.role) {
    const [made] = (await jmap(token, [
      [
        "Mailbox/set",
        {
          accountId,
          create: {
            box: {
              name: to.role === "trash" ? "Trash" : "Archive",
              role: to.role,
            },
          },
        },
        "b0",
      ],
    ])) as [{ created?: Record<string, { id: string }>; notCreated?: unknown }];

    target = made.created?.box?.id;
    if (!target) {
      throw new Error(
        `No ${to.role} mailbox and none could be made: ${JSON.stringify(made.notCreated)}`,
      );
    }
  }
  if (!target) throw new Error("No such mailbox in this account.");

  const mailboxIds = { [target]: true };
  const [res] = (await jmap(token, [
    [
      "Email/set",
      {
        accountId,
        update: Object.fromEntries(ids.map((id) => [id, { mailboxIds }])),
      },
      "e0",
    ],
  ])) as [{ notUpdated?: Record<string, unknown> }];

  if (res.notUpdated && Object.keys(res.notUpdated).length > 0) {
    throw new Error(
      `Stalwart refused the move: ${JSON.stringify(res.notUpdated)}`,
    );
  }
};

const BLOB_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Stalwart advertises its public origin, which this server must not call: that
 * hostname is routed for people, not for the app, and it does not serve JMAP.
 * Swapped textually so the {placeholders} survive, which a URL parser escapes.
 */
const internalUrl = (advertised: string) =>
  config().url + advertised.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, "");

/** Streams one blob straight from Stalwart; the caller's token never leaves here. */
export const downloadBlob = async (
  token: string,
  blobId: string,
  name: string,
  type: string,
): Promise<Response> => {
  const { session, accountId } = await mailSession(token);
  if (!session.downloadUrl) {
    throw new Error("Stalwart session advertises no download URL.");
  }
  const url = internalUrl(session.downloadUrl)
    .replace("{accountId}", encodeURIComponent(accountId))
    .replace("{blobId}", encodeURIComponent(blobId))
    .replace("{name}", encodeURIComponent(name))
    .replace("{type}", encodeURIComponent(type));

  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok)
    throw new Error(`Stalwart blob download failed (${res.status}).`);
  return res;
};

export const uploadBlob = async (
  token: string,
  body: ArrayBuffer,
  type: string,
): Promise<{ blobId: string; size: number }> => {
  if (body.byteLength > BLOB_MAX_BYTES) {
    throw new Error("That file is too large to attach.");
  }
  const { session, accountId } = await mailSession(token);
  if (!session.uploadUrl) {
    throw new Error("Stalwart session advertises no upload URL.");
  }
  const res = await fetch(
    internalUrl(session.uploadUrl).replace(
      "{accountId}",
      encodeURIComponent(accountId),
    ),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": type || "application/octet-stream",
      },
      body,
    },
  );
  if (!res.ok) throw new Error(`Stalwart refused the upload (${res.status}).`);

  const blob = (await res.json()) as { blobId?: string; size?: number };
  if (!blob.blobId) throw new Error("Stalwart returned no blob id.");
  return { blobId: blob.blobId, size: blob.size ?? body.byteLength };
};

export const mailStats = async (
  token: string,
  days: number,
): Promise<{ sent: number; received: number }> => {
  const accountId = await mailAccountId(token);
  const after = new Date(Date.now() - days * 86_400_000).toISOString();
  const [boxes] = (await jmap(token, [
    ["Mailbox/get", { accountId, ids: null, properties: ["id", "role"] }, "m0"],
  ])) as [{ list: { id: string; role: string | null }[] }];

  const byRole = (role: string) =>
    boxes.list.find((box) => box.role === role)?.id;
  const wanted: ["sent" | "received", string][] = [];
  const sent = byRole("sent");
  const inbox = byRole("inbox");
  if (sent) wanted.push(["sent", sent]);
  if (inbox) wanted.push(["received", inbox]);

  const counts = { sent: 0, received: 0 };
  if (wanted.length === 0) return counts;

  const results = (await jmap(
    token,
    wanted.map(([key, id]) => [
      "Email/query",
      {
        accountId,
        filter: { inMailbox: id, after },
        limit: 1,
        calculateTotal: true,
      },
      key,
    ]),
  )) as { total?: number }[];

  wanted.forEach(([key], index) => {
    counts[key] = results[index]?.total ?? 0;
  });
  return counts;
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

export type Attachment = { blobId: string; type: string; name: string };

export type OutgoingMessage = {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: Attachment[];
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
  signer: Signer,
): Promise<void> => {
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
            from: [{ name: signer.name, email: identity.email }],
            to: msg.to.map((email) => ({ email })),
            ...(msg.cc?.length
              ? { cc: msg.cc.map((email) => ({ email })) }
              : {}),
            subject: msg.subject,
            bodyValues: {
              text: { value: withFooter(msg.text, signer) },
              ...(msg.html
                ? {
                    html: {
                      value: withHtmlFooter(
                        sanitizeOutboundHtml(msg.html),
                        signer,
                      ),
                    },
                  }
                : {}),
            },
            textBody: [{ partId: "text", type: "text/plain" }],
            ...(msg.html
              ? { htmlBody: [{ partId: "html", type: "text/html" }] }
              : {}),
            ...(msg.attachments?.length
              ? {
                  attachments: msg.attachments.map((file) => ({
                    blobId: file.blobId,
                    type: file.type || "application/octet-stream",
                    name: file.name,
                    disposition: "attachment",
                  })),
                }
              : {}),
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
