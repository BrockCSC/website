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

type Condition = Record<string, unknown>;

const TERM = /(?:(\w+):)?(?:"([^"]*)"|(\S+))/g;

const FIELDS: Record<string, (value: string) => Condition | undefined> = {
  from: (value) => ({ from: value }),
  to: (value) => ({ to: value }),
  subject: (value) => ({ subject: value }),
  has: (value) =>
    value.toLowerCase() === "attachment" ? { hasAttachment: true } : undefined,
  is: (value) =>
    ({
      unread: { notKeyword: "$seen" },
      starred: { hasKeyword: "$flagged" },
    })[value.toLowerCase()],
};

const inFolder = (value: string, boxes: Mailbox[]) => {
  const wanted = value.toLowerCase();
  const box = boxes.find(
    (item) => item.name.toLowerCase() === wanted || item.role === wanted,
  );
  return box ? { inMailbox: box.id } : undefined;
};

const searchConditions = (search: string, boxes: Mailbox[]): Condition[] => {
  const conditions: Condition[] = [];
  const text: string[] = [];

  for (const [, field, quoted, bare] of search.matchAll(TERM)) {
    const value = quoted ?? bare;
    if (!value) continue;
    const key = field?.toLowerCase();
    const made =
      key === "in" ? inFolder(value, boxes) : key ? FIELDS[key]?.(value) : null;
    if (made) conditions.push(made);
    else text.push(field ? `${field}:${value}` : value);
  }

  if (text.length > 0) conditions.push({ text: text.join(" ") });
  return conditions;
};

/** Nobody searching their mail means "and also the bin". */
const BURIED = ["trash", "junk"];

const messageFilter = async (token: string, opts: MessageQuery) => {
  const search = opts.search?.trim() ?? "";
  const scoped = Boolean(opts.mailboxId) || /(?:^|\s)in:/i.test(search);
  const boxes = search && !opts.mailboxId ? await listMailboxes(token) : [];
  const buried = scoped
    ? []
    : boxes.filter((box) => BURIED.includes(box.role ?? "")).map((b) => b.id);

  const conditions = [
    ...(opts.mailboxId ? [{ inMailbox: opts.mailboxId }] : []),
    ...(search ? searchConditions(search, boxes) : []),
    ...(buried.length ? [{ inMailboxOtherThan: buried }] : []),
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
  filter: Condition | undefined,
): Promise<MessagePage> => {
  const calls: Call[] = [
    [
      "Email/query",
      {
        accountId,
        filter,
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
  const [accountId, filter] = await Promise.all([
    mailAccountId(token),
    messageFilter(token, opts),
  ]);
  const run = (threaded: boolean) =>
    queryMessages(token, accountId, opts, threaded, filter);
  if (!opts.threaded) return run(false);
  return run(true).catch(() => run(false));
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

export const destroyMessages = async (
  token: string,
  ids: string[],
): Promise<number> => {
  if (ids.length === 0) return 0;
  const accountId = await mailAccountId(token);
  const [res] = (await jmap(token, [
    ["Email/set", { accountId, destroy: ids }, "d0"],
  ])) as [{ destroyed?: string[]; notDestroyed?: Record<string, unknown> }];

  if (res.notDestroyed && Object.keys(res.notDestroyed).length > 0) {
    throw new Error(
      `Stalwart kept some messages: ${JSON.stringify(res.notDestroyed)}`,
    );
  }
  return res.destroyed?.length ?? 0;
};

export const purgeTrash = async (
  token: string,
  days: number,
): Promise<number> => {
  const accountId = await mailAccountId(token);
  const trash = (await listMailboxes(token)).find(
    (box) => box.role === "trash",
  );
  if (!trash) return 0;

  const before = new Date(Date.now() - days * 86_400_000).toISOString();
  const [found] = (await jmap(token, [
    [
      "Email/query",
      {
        accountId,
        filter: {
          operator: "AND",
          conditions: [{ inMailbox: trash.id }, { before }],
        },
        limit: 500,
      },
      "q0",
    ],
  ])) as [{ ids: string[] }];

  return destroyMessages(token, found.ids ?? []);
};

export const moveMessages = async (
  token: string,
  ids: string[],
  to: { role?: "trash" | "archive"; mailboxId?: string },
): Promise<void> => {
  const accountId = await mailAccountId(token);
  const [boxes] = (await jmap(token, [
    ["Mailbox/get", { accountId, ids: null, properties: ["id", "role"] }, "m0"],
  ])) as [{ list: { id: string; role: string | null }[] }];

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

const internalUrl = (advertised: string) =>
  config().url + advertised.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, "");

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
