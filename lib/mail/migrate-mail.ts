/**
 * JMAP calls that move data between two accounts. Everything in jmap-mail.ts
 * resolves one account per call; a copy needs the source and the destination
 * in the same request, which the admin credential can address by id.
 */

import { adminAccess } from "./access";
import {
  downloadBlob,
  internalUrl,
  jmap,
  mailSession,
  type Call,
} from "./jmap-mail";
import { chunked } from "./stalwart";

export type TreeMailbox = {
  id: string;
  name: string;
  role: string | null;
  parentId: string | null;
  sortOrder: number;
  isSubscribed: boolean;
  totalEmails: number;
  unreadEmails: number;
};

export const listMailboxTree = async (
  accountId: string,
): Promise<TreeMailbox[]> => {
  const [res] = (await jmap(adminAccess(accountId), [
    [
      "Mailbox/get",
      {
        accountId,
        ids: null,
        properties: [
          "id",
          "name",
          "role",
          "parentId",
          "sortOrder",
          "isSubscribed",
          "totalEmails",
          "unreadEmails",
        ],
      },
      "m0",
    ],
  ])) as [{ list: TreeMailbox[] }];
  return res.list;
};

export const createFolder = async (
  accountId: string,
  box: {
    name: string;
    parentId: string | null;
    role: string | null;
    sortOrder: number;
    isSubscribed: boolean;
  },
): Promise<string> => {
  const [res] = (await jmap(adminAccess(accountId), [
    [
      "Mailbox/set",
      {
        accountId,
        create: {
          box: {
            name: box.name,
            parentId: box.parentId,
            ...(box.role ? { role: box.role } : {}),
            sortOrder: box.sortOrder,
            isSubscribed: box.isSubscribed,
          },
        },
      },
      "b0",
    ],
  ])) as [{ created?: Record<string, { id: string }>; notCreated?: unknown }];
  const id = res.created?.box?.id;
  if (!id) {
    throw new Error(
      `Stalwart did not create folder ${box.name}: ${JSON.stringify(res.notCreated)}`,
    );
  }
  return id;
};

export type EmailFacts = {
  id: string;
  blobId: string;
  mailboxIds: Record<string, boolean>;
  keywords: Record<string, boolean>;
  receivedAt: string;
  messageId: string[] | null;
  size: number;
};

const FACTS = [
  "id",
  "blobId",
  "mailboxIds",
  "keywords",
  "receivedAt",
  "messageId",
  "size",
];

/** Oldest first, so a cursor stays meaningful while mail keeps arriving. */
export const emailPage = async (
  accountId: string,
  mailboxId: string,
  position: number,
  limit: number,
): Promise<{ total: number; emails: EmailFacts[] }> => {
  const [query, get] = (await jmap(adminAccess(accountId), [
    [
      "Email/query",
      {
        accountId,
        filter: { inMailbox: mailboxId },
        sort: [{ property: "receivedAt", isAscending: true }],
        position,
        limit,
        calculateTotal: true,
      },
      "q0",
    ],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "q0", name: "Email/query", path: "/ids" },
        properties: FACTS,
      },
      "g0",
    ],
  ])) as [{ ids: string[]; total: number }, { list: EmailFacts[] }];
  const byId = new Map(get.list.map((email) => [email.id, email]));
  return {
    total: query.total,
    emails: query.ids.flatMap((id) => byId.get(id) ?? []),
  };
};

/** Missing ids are simply absent from the result. */
export const emailFacts = async (
  accountId: string,
  ids: string[],
): Promise<EmailFacts[]> => {
  const out: EmailFacts[] = [];
  for (const request of chunked(ids, 1600)) {
    const calls: Call[] = chunked(request, 100).map((part, at) => [
      "Email/get",
      { accountId, ids: part, properties: FACTS },
      `g${at}`,
    ]);
    const results = (await jmap(adminAccess(accountId), calls)) as {
      list: EmailFacts[];
    }[];
    for (const result of results) out.push(...result.list);
  }
  return out;
};

/**
 * Message-ID -> every message the account holds with it. Senders choose
 * Message-IDs, so the caller decides which hit, if any, stands for a copy.
 */
export const emailsByMessageIds = async (
  accountId: string,
  messageIds: string[],
): Promise<Map<string, EmailFacts[]>> => {
  const found = new Map<string, EmailFacts[]>();
  if (!messageIds.length) return found;
  const conditions = messageIds.map((value) => ({
    header: ["Message-ID", value],
  }));
  const [, get] = (await jmap(adminAccess(accountId), [
    [
      "Email/query",
      {
        accountId,
        filter:
          conditions.length === 1
            ? conditions[0]
            : { operator: "OR", conditions },
        limit: messageIds.length + 50,
      },
      "q0",
    ],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "q0", name: "Email/query", path: "/ids" },
        properties: FACTS,
      },
      "g0",
    ],
  ])) as [unknown, { list: EmailFacts[] }];
  for (const email of get.list) {
    for (const value of email.messageId ?? []) {
      const hits = found.get(value);
      if (hits) hits.push(email);
      else found.set(value, [email]);
    }
  }
  return found;
};

export type CopyItem = {
  id: string;
  mailboxIds: Record<string, boolean>;
  keywords: Record<string, boolean>;
  receivedAt: string;
};

/** Blob-preserving, so headers, Message-ID and threading survive. Never destroys the original. */
export const copyEmails = async (
  fromAccountId: string,
  toAccountId: string,
  items: CopyItem[],
): Promise<{
  created: Record<string, string>;
  notCreated: Record<string, unknown>;
}> => {
  const [res] = (await jmap(adminAccess(toAccountId), [
    [
      "Email/copy",
      {
        fromAccountId,
        accountId: toAccountId,
        create: Object.fromEntries(
          items.map((item) => [
            item.id,
            {
              id: item.id,
              mailboxIds: item.mailboxIds,
              keywords: item.keywords,
              receivedAt: item.receivedAt,
            },
          ]),
        ),
      },
      "c0",
    ],
  ])) as [
    {
      created?: Record<string, { id: string }>;
      notCreated?: Record<string, unknown>;
    },
  ];
  return {
    created: Object.fromEntries(
      Object.entries(res.created ?? {}).map(([key, made]) => [key, made.id]),
    ),
    notCreated: res.notCreated ?? {},
  };
};

/** No size cap: this is server-to-server, not a member's attachment. */
export const uploadMessage = async (
  accountId: string,
  body: ArrayBuffer,
): Promise<string> => {
  const access = adminAccess(accountId);
  const { session } = await mailSession(access);
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
        authorization: access.authorization,
        "content-type": "message/rfc822",
      },
      body,
    },
  );
  if (!res.ok) throw new Error(`Stalwart refused the upload (${res.status}).`);
  const blob = (await res.json()) as { blobId?: string };
  if (!blob.blobId) throw new Error("Stalwart returned no blob id.");
  return blob.blobId;
};

export const importBlob = async (
  accountId: string,
  blobId: string,
  mailboxIds: Record<string, boolean>,
  keywords: Record<string, boolean>,
  receivedAt: string,
): Promise<string> => {
  const [res] = (await jmap(adminAccess(accountId), [
    [
      "Email/import",
      {
        accountId,
        emails: { m: { blobId, mailboxIds, keywords, receivedAt } },
      },
      "i0",
    ],
  ])) as [{ created?: Record<string, { id: string }>; notCreated?: unknown }];
  const id = res.created?.m?.id;
  if (!id) {
    throw new Error(
      `Stalwart did not import the message: ${JSON.stringify(res.notCreated)}`,
    );
  }
  return id;
};

/** The slow path when Email/copy is refused: raw message across, then import. */
export const importAcross = async (
  fromAccountId: string,
  toAccountId: string,
  email: EmailFacts,
  mailboxIds: Record<string, boolean>,
): Promise<string> => {
  const blob = await downloadBlob(
    adminAccess(fromAccountId),
    email.blobId,
    "message.eml",
    "message/rfc822",
  );
  const blobId = await uploadMessage(toAccountId, await blob.arrayBuffer());
  return importBlob(
    toAccountId,
    blobId,
    mailboxIds,
    email.keywords,
    email.receivedAt,
  );
};

export const updateEmails = async (
  accountId: string,
  updates: Record<string, Record<string, unknown>>,
): Promise<void> => {
  if (!Object.keys(updates).length) return;
  for (const batch of chunked(Object.entries(updates), 50)) {
    const [res] = (await jmap(adminAccess(accountId), [
      ["Email/set", { accountId, update: Object.fromEntries(batch) }, "e0"],
    ])) as [{ notUpdated?: Record<string, unknown> }];
    if (res.notUpdated && Object.keys(res.notUpdated).length) {
      throw new Error(
        `Stalwart refused the update: ${JSON.stringify(res.notUpdated)}`,
      );
    }
  }
};

export const destroyEmails = async (
  accountId: string,
  ids: string[],
): Promise<void> => {
  for (const batch of chunked(ids, 50)) {
    await jmap(adminAccess(accountId), [
      ["Email/set", { accountId, destroy: batch }, "d0"],
    ]);
  }
};
