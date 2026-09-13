import type { MigrationMailbox, MigrationVerification } from "@/lib/api/types";
import {
  copyEmails,
  createFolder,
  destroyEmails,
  emailFacts,
  emailPage,
  emailsByMessageIds,
  importAcross,
  listMailboxTree,
  updateEmails,
  type EmailFacts,
  type TreeMailbox,
} from "@/lib/mail/migrate-mail";
import { chunked } from "@/lib/mail/stalwart";
import { on, sameSet, type MigrationCtx } from "./context";

const PAGE = 100;
const COPY_BATCH = 50;

const accountsOf = (ctx: MigrationCtx) => {
  const from = ctx.record.from.mailboxId;
  const to = ctx.record.to.mailboxId;
  if (!from || !to) {
    throw new Error("Both mailboxes must exist before mail can be copied.");
  }
  return { from, to };
};

const depthOf = (box: TreeMailbox, byId: Map<string, TreeMailbox>) => {
  let depth = 0;
  for (
    let parent = box.parentId ? byId.get(box.parentId) : undefined;
    parent && depth < 50;
    parent = parent.parentId ? byId.get(parent.parentId) : undefined
  ) {
    depth++;
  }
  return depth;
};

/**
 * Maps every old folder to one on the new account, creating what is missing
 * parent-first. Role folders match by role (Stalwart pre-creates them), the
 * rest by parent and name. Safe to re-run: counts refresh, mappings stick.
 */
export const ensureFolders = async (ctx: MigrationCtx): Promise<void> => {
  const { from, to } = accountsOf(ctx);
  const [oldTree, newTree] = await Promise.all([
    listMailboxTree(from),
    listMailboxTree(to),
  ]);
  const mailboxes: Record<string, MigrationMailbox> = {};
  for (const box of oldTree) {
    const before = ctx.record.mailboxes[box.id];
    mailboxes[box.id] = {
      cursor: before?.cursor ?? 0,
      newId: before?.newId,
      name: box.name,
      role: box.role,
      parentId: box.parentId,
      old: { total: box.totalEmails, unread: box.unreadEmails },
    };
  }
  const newIds = new Set(newTree.map((box) => box.id));
  const used = new Set<string>();
  for (const entry of Object.values(mailboxes)) {
    if (entry.newId && !newIds.has(entry.newId)) delete entry.newId;
    if (entry.newId) used.add(entry.newId);
  }

  const oldById = new Map(oldTree.map((box) => [box.id, box]));
  const ordered = [...oldTree].sort(
    (a, b) => depthOf(a, oldById) - depthOf(b, oldById),
  );
  for (const box of ordered) {
    const entry = mailboxes[box.id];
    if (entry.newId) continue;
    const parentId = box.parentId
      ? (mailboxes[box.parentId]?.newId ?? null)
      : null;
    const found =
      (box.role
        ? newTree.find((one) => !used.has(one.id) && one.role === box.role)
        : undefined) ??
      newTree.find(
        (one) =>
          !used.has(one.id) &&
          one.parentId === parentId &&
          one.name.toLowerCase() === box.name.toLowerCase(),
      );
    if (found) {
      entry.newId = found.id;
      used.add(found.id);
      continue;
    }
    const role =
      box.role && !newTree.some((one) => one.role === box.role)
        ? box.role
        : null;
    const id = await createFolder(to, {
      name: box.name,
      parentId,
      role,
      sortOrder: box.sortOrder,
      isSubscribed: box.isSubscribed,
    });
    entry.newId = id;
    used.add(id);
    newTree.push({ ...box, id, parentId, role });
  }
  await ctx.save({ mailboxes });
};

const mapBoxes = (
  ctx: MigrationCtx,
  mailboxIds: Record<string, boolean>,
): Record<string, boolean> => {
  const mapped = on(mailboxIds).flatMap((oldId) => {
    const newId = ctx.record.mailboxes[oldId]?.newId;
    return newId ? [newId] : [];
  });
  if (!mapped.length) {
    throw new Error("A message sits in a folder that has no counterpart yet.");
  }
  return Object.fromEntries(mapped.map((id) => [id, true]));
};

/**
 * Copies what the target does not already hold. Message-ID is checked on the
 * target first, which absorbs a crash between copy and persist and mail a
 * list delivered to both addresses meanwhile.
 */
const copyFresh = async (
  ctx: MigrationCtx,
  from: string,
  to: string,
  fresh: EmailFacts[],
  copied: Record<string, string>,
): Promise<void> => {
  const present = await emailsByMessageIds(
    to,
    fresh.flatMap((email) => email.messageId?.[0] ?? []),
  );
  const wanted: EmailFacts[] = [];
  for (const email of fresh) {
    const hit = email.messageId?.[0]
      ? present.get(email.messageId[0])
      : undefined;
    if (hit) copied[email.id] = hit;
    else wanted.push(email);
  }
  for (const batch of chunked(wanted, COPY_BATCH)) {
    let created: Record<string, string> = {};
    try {
      created = (
        await copyEmails(
          from,
          to,
          batch.map((email) => ({
            id: email.id,
            mailboxIds: mapBoxes(ctx, email.mailboxIds),
            keywords: email.keywords,
            receivedAt: email.receivedAt,
          })),
        )
      ).created;
    } catch {
      // Email/copy refused outright: fall through to the blob path per message.
    }
    Object.assign(copied, created);
    for (const email of batch) {
      if (copied[email.id]) continue;
      copied[email.id] = await importAcross(
        from,
        to,
        email,
        mapBoxes(ctx, email.mailboxIds),
      );
    }
  }
};

/** Flags and folder membership changed on the old side since the copy. */
const reconcile = async (
  ctx: MigrationCtx,
  from: string,
  to: string,
  known: EmailFacts[],
  copied: Record<string, string>,
): Promise<void> => {
  const mirrors = new Map(
    (
      await emailFacts(
        to,
        known.map((email) => copied[email.id]),
      )
    ).map((facts) => [facts.id, facts]),
  );
  const updates: Record<string, Record<string, unknown>> = {};
  const missing: EmailFacts[] = [];
  for (const email of known) {
    const mirror = mirrors.get(copied[email.id]);
    if (!mirror) {
      missing.push(email);
      continue;
    }
    const patch: Record<string, unknown> = {};
    const boxes = mapBoxes(ctx, email.mailboxIds);
    if (!sameSet(Object.keys(boxes), on(mirror.mailboxIds))) {
      patch.mailboxIds = boxes;
    }
    if (!sameSet(on(email.keywords), on(mirror.keywords))) {
      patch.keywords = email.keywords;
    }
    if (Object.keys(patch).length) updates[mirror.id] = patch;
  }
  await updateEmails(to, updates);
  if (missing.length) {
    for (const email of missing) delete copied[email.id];
    await copyFresh(ctx, from, to, missing, copied);
  }
};

/**
 * Walks every old folder oldest-first. The first pass resumes from each
 * folder's cursor; a delta pass restarts from zero, fixes flags and moves on
 * copies it already made, and drops copies whose original is gone.
 */
export const syncMail = async (
  ctx: MigrationCtx,
  delta: boolean,
): Promise<void> => {
  const { from, to } = accountsOf(ctx);
  const seen = new Set<string>();
  for (const [oldBoxId, box] of Object.entries(ctx.record.mailboxes)) {
    let position = delta ? 0 : box.cursor;
    for (;;) {
      const page = await emailPage(from, oldBoxId, position, PAGE);
      if (!page.emails.length) break;
      const copied = { ...ctx.record.copied };
      const fresh: EmailFacts[] = [];
      const known: EmailFacts[] = [];
      for (const email of page.emails) {
        seen.add(email.id);
        (copied[email.id] ? known : fresh).push(email);
      }
      if (fresh.length) await copyFresh(ctx, from, to, fresh, copied);
      if (delta && known.length) await reconcile(ctx, from, to, known, copied);
      position += page.emails.length;
      await ctx.save({
        copied,
        mailboxes: {
          ...ctx.record.mailboxes,
          [oldBoxId]: { ...ctx.record.mailboxes[oldBoxId], cursor: position },
        },
      });
      if (position >= page.total) break;
    }
  }
  if (!delta) return;
  const gone = Object.keys(ctx.record.copied).filter((id) => !seen.has(id));
  if (!gone.length) return;
  await destroyEmails(
    to,
    gone.map((id) => ctx.record.copied[id]),
  );
  const copied = { ...ctx.record.copied };
  for (const id of gone) delete copied[id];
  await ctx.save({ copied });
};

export type MailVerification = Pick<
  MigrationVerification,
  | "folders"
  | "messagesChecked"
  | "keywordMismatches"
  | "receivedAtMismatches"
  | "otherMismatches"
  | "notes"
> & { ok: boolean };

/** Compares every copied message and every folder; the old side is frozen by now. */
export const verifyMail = async (
  ctx: MigrationCtx,
): Promise<MailVerification> => {
  const { from, to } = accountsOf(ctx);
  const [oldTree, newTree] = await Promise.all([
    listMailboxTree(from),
    listMailboxTree(to),
  ]);
  const newById = new Map(newTree.map((box) => [box.id, box]));
  const notes: string[] = [];
  const bytes = new Map<string, number>();
  let messagesChecked = 0;
  let keywordMismatches = 0;
  let receivedAtMismatches = 0;
  let otherMismatches = 0;
  let uncopied = 0;

  for (const box of oldTree) {
    for (let position = 0; ; position += PAGE) {
      const page = await emailPage(from, box.id, position, PAGE);
      for (const email of page.emails) {
        if (!ctx.record.copied[email.id]) uncopied++;
      }
      if (!page.emails.length || position + page.emails.length >= page.total) {
        break;
      }
    }
  }
  if (uncopied) notes.push(`${uncopied} message(s) were never copied.`);

  for (const batch of chunked(Object.entries(ctx.record.copied), 1000)) {
    const [olds, news] = await Promise.all([
      emailFacts(
        from,
        batch.map(([oldId]) => oldId),
      ),
      emailFacts(
        to,
        batch.map(([, newId]) => newId),
      ),
    ]);
    const oldFacts = new Map(olds.map((facts) => [facts.id, facts]));
    const newFacts = new Map(news.map((facts) => [facts.id, facts]));
    for (const [oldId, newId] of batch) {
      const original = oldFacts.get(oldId);
      if (!original) continue;
      messagesChecked++;
      for (const boxId of on(original.mailboxIds)) {
        bytes.set(boxId, (bytes.get(boxId) ?? 0) + original.size);
      }
      const copy = newFacts.get(newId);
      if (!copy) {
        otherMismatches++;
        continue;
      }
      if (!sameSet(on(original.keywords), on(copy.keywords))) {
        keywordMismatches++;
      }
      if (original.receivedAt !== copy.receivedAt) receivedAtMismatches++;
      if (
        original.size !== copy.size ||
        (original.messageId?.[0] ?? null) !== (copy.messageId?.[0] ?? null)
      ) {
        otherMismatches++;
      }
    }
  }

  const folders: MigrationVerification["folders"] = {};
  let foldersOk = true;
  for (const box of oldTree) {
    const newId = ctx.record.mailboxes[box.id]?.newId;
    const mirror = newId ? newById.get(newId) : undefined;
    folders[box.id] = {
      name: box.name,
      old: [box.totalEmails, box.unreadEmails, bytes.get(box.id) ?? 0],
      new: mirror ? [mirror.totalEmails, mirror.unreadEmails] : [-1, -1],
    };
    if (!mirror) {
      foldersOk = false;
      notes.push(`Folder "${box.name}" has no counterpart on the new mailbox.`);
    } else if (mirror.totalEmails < box.totalEmails) {
      foldersOk = false;
      notes.push(
        `Folder "${box.name}" holds ${box.totalEmails} messages on the old mailbox but ${mirror.totalEmails} on the new one.`,
      );
    } else if (mirror.totalEmails > box.totalEmails) {
      notes.push(
        `Folder "${box.name}" already has ${mirror.totalEmails - box.totalEmails} new message(s) on the new mailbox.`,
      );
    }
  }
  if (keywordMismatches) notes.push(`${keywordMismatches} flag mismatch(es).`);
  if (receivedAtMismatches) {
    notes.push(`${receivedAtMismatches} received-date mismatch(es).`);
  }
  if (otherMismatches) {
    notes.push(`${otherMismatches} message(s) differ in size or Message-ID.`);
  }

  return {
    folders,
    messagesChecked,
    keywordMismatches,
    receivedAtMismatches,
    otherMismatches,
    notes,
    ok:
      foldersOk &&
      uncopied === 0 &&
      keywordMismatches === 0 &&
      receivedAtMismatches === 0 &&
      otherMismatches === 0,
  };
};
