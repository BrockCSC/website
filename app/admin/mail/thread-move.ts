import type { MessageSummary } from "@/lib/mail/jmap-mail";
import { withAs } from "./inbox-picker";

// Conversation-level move (spec D18), expanded on the client. The list is
// collapsed by thread, so Archive, Delete and Move act on every message of
// the conversation that sits in the folder being viewed. Copies elsewhere
// (your own reply in Sent) are never touched. Undo moves exactly the ids
// that went back to where they came from.

/** bulk/move's MAX_IDS. */
export const MAX_MOVE_IDS = 200;

export type MoveTarget = { to: "archive" | "trash" } | { mailboxId: string };

type Expand = {
  /** Directly chosen messages (list rows or the open message). */
  messages: MessageSummary[];
  /** Thread sizes from the list response. */
  threadCounts: Record<string, number>;
  /** The folder the user is looking at. */
  from: string;
  viewing: string | null;
  /** Threads already loaded (the open conversation), by threadId. */
  known?: Record<string, MessageSummary[]>;
};

const fetchThread = (threadId: string, viewing: string | null) =>
  fetch(withAs(`/api/mail/threads/${encodeURIComponent(threadId)}`, viewing))
    .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
    .then((data: { messages: MessageSummary[] }) => data.messages);

/**
 * Every id to move: the chosen messages plus the other messages of their
 * threads that are in `from`. A thread that fails to load falls back to
 * just the chosen message. Deduped, capped at MAX_MOVE_IDS.
 */
export async function expandConversation({
  messages,
  threadCounts,
  from,
  viewing,
  known = {},
}: Expand): Promise<string[]> {
  const ids = new Set(messages.map((message) => message.id));
  const threads = [
    ...new Set(
      messages
        // A message opened by deep link or palette may have no list row (no
        // threadCounts entry) while its loaded thread is in `known`.
        .filter(
          (message) =>
            (threadCounts[message.threadId] ?? 1) > 1 ||
            (known[message.threadId]?.length ?? 0) > 1,
        )
        .map((message) => message.threadId),
    ),
  ];

  const loaded = await Promise.all(
    threads.map((threadId) =>
      known[threadId]?.length
        ? Promise.resolve(known[threadId])
        : fetchThread(threadId, viewing).catch(() => []),
    ),
  );
  for (const thread of loaded) {
    for (const item of thread) {
      if (item.mailboxIds?.[from]) ids.add(item.id);
    }
  }
  return [...ids].slice(0, MAX_MOVE_IDS);
}

/** POST bulk/move. Resolves true on success. */
export const moveIds = (ids: string[], target: MoveTarget) =>
  fetch("/api/mail/messages/bulk/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, ...target }),
  })
    .then((res) => res.ok)
    .catch(() => false);
