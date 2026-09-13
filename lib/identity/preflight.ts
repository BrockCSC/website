import { randomBytes } from "node:crypto";
import type { PreflightCheck, PreflightReport } from "@/lib/api/types";
import { adminAccess } from "@/lib/mail/access";
import { downloadBlob } from "@/lib/mail/jmap-mail";
import {
  copyEmails,
  createFolder,
  emailFacts,
  emailsByMessageIds,
  importAcross,
  importBlob,
  listMailboxTree,
  uploadMessage,
  type EmailFacts,
} from "@/lib/mail/migrate-mail";
import { domain } from "@/lib/mail/provision";
import {
  accountAliases,
  createMailbox,
  destroyAccount,
  listSieveScripts,
  localPartTaken,
  makeReadOnly,
  putSieveScript,
  removeSieveScript,
  setAccountAliases,
} from "@/lib/mail/stalwart";
import {
  RETIRED_NOTICE_SCRIPT,
  RETIRED_REJECT_SCRIPT,
  retiredNoticeScript,
  retiredRejectScript,
} from "./retired-notice";
import { shared } from "./shared";
import { FORWARD_DAYS } from "./step-list";

/**
 * Per process, on purpose: a Stalwart upgrade lands with a deploy, and every
 * call below is one the app never made before this feature. A real rename
 * refuses to start until an approver has watched these pass on this build.
 */
const state = shared("brockcsc.migrationPreflight", () => ({
  last: null as PreflightReport | null,
}));

export const lastPreflight = () => state.last;

export class PreflightRequired extends Error {
  constructor() {
    super(
      "Run the migration preflight first (People → Run migration preflight). It has to pass once per deploy before a real rename can start.",
    );
  }
}

export const requirePreflight = () => {
  if (state.last?.ok !== true) throw new PreflightRequired();
};

const RECEIVED_AT = "2024-01-01T00:00:00Z";
const PERSONAL_SCRIPT = "preflight-filters";
/** Roles a mailbox tree may carry; the first one the account lacks is the one to try creating. */
const ROLES = ["archive", "junk", "drafts", "sent", "trash"];

const message = (messageId: string, subject: string) =>
  [
    `From: BrockCSC Preflight <security@${domain()}>`,
    `To: preflight@${domain()}`,
    `Subject: ${subject}`,
    `Message-ID: <${messageId}>`,
    "Date: Mon, 01 Jan 2024 00:00:00 +0000",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "This message exists only to test copying between accounts.",
    "",
  ].join("\r\n");

const scriptNamed = async (accountId: string, name: string) =>
  (await listSieveScripts(accountId)).find((one) => one.name === name);

export const runPreflight = async (): Promise<PreflightReport> => {
  const tag = randomBytes(3).toString("hex");
  const a = `zz-preflight-${tag}-a`;
  const b = `zz-preflight-${tag}-b`;
  const alias = `zz-preflight-${tag}-alias`;
  const messageId = `preflight-${tag}@${domain()}`;
  const secondId = `preflight-${tag}-2@${domain()}`;
  const checks: PreflightCheck[] = [];
  let blocked = false;
  const ids = {
    a: "",
    b: "",
    folderA: "",
    childA: "",
    folderB: "",
    emailA: "",
    emailA2: "",
    emailB: "",
  };
  let secondFacts: EmailFacts | undefined;

  const check = async (
    id: string,
    label: string,
    work: () => Promise<void>,
  ) => {
    if (blocked) {
      checks.push({ id, label, ok: false, skipped: true });
      return;
    }
    try {
      await work();
      checks.push({ id, label, ok: true });
    } catch (err) {
      blocked = true;
      checks.push({
        id,
        label,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const importInto = async (
    accountId: string,
    folderId: string,
    id: string,
    subject: string,
  ) => {
    const blobId = await uploadMessage(
      accountId,
      new TextEncoder().encode(message(id, subject)).buffer as ArrayBuffer,
    );
    return importBlob(
      accountId,
      blobId,
      { [folderId]: true },
      { $seen: true },
      RECEIVED_AT,
    );
  };

  try {
    await check("account:create", "Create two throwaway accounts", async () => {
      ids.a = await createMailbox({
        localPart: a,
        displayName: "Preflight A",
        domain: domain(),
      });
      ids.b = await createMailbox({
        localPart: b,
        displayName: "Preflight B",
        domain: domain(),
      });
    });
    await check(
      "mailbox:folders",
      "Read and create folders, nested too",
      async () => {
        await listMailboxTree(ids.a);
        const folder = {
          name: "Preflight",
          parentId: null,
          role: null,
          sortOrder: 10,
          isSubscribed: true,
        };
        ids.folderA = await createFolder(ids.a, folder);
        ids.folderB = await createFolder(ids.b, folder);
        ids.childA = await createFolder(ids.a, {
          ...folder,
          name: "Nested",
          parentId: ids.folderA,
        });
        const child = (await listMailboxTree(ids.a)).find(
          (box) => box.id === ids.childA,
        );
        if (child?.parentId !== ids.folderA) {
          throw new Error(
            "The nested folder did not read back under its parent.",
          );
        }
      },
    );
    await check(
      "mailbox:role",
      "Create a folder with a role of its own",
      async () => {
        const tree = await listMailboxTree(ids.a);
        const role = ROLES.find((one) => !tree.some((box) => box.role === one));
        // A migration only ever sets a role the new account is missing, so
        // an account that already has all of them proves nothing here.
        if (!role) return;
        const id = await createFolder(ids.a, {
          name: `Preflight ${role}`,
          parentId: null,
          role,
          sortOrder: 20,
          isSubscribed: true,
        });
        const made = (await listMailboxTree(ids.a)).find(
          (box) => box.id === id,
        );
        if (made?.role !== role) {
          throw new Error(
            `The folder read back with role ${made?.role ?? "none"}.`,
          );
        }
      },
    );
    await check("email:import", "Import two messages", async () => {
      ids.emailA = await importInto(
        ids.a,
        ids.folderA,
        messageId,
        "Migration preflight",
      );
      ids.emailA2 = await importInto(
        ids.a,
        ids.childA,
        secondId,
        "Migration preflight, second message",
      );
      const facts = await emailFacts(ids.a, [ids.emailA, ids.emailA2]);
      const first = facts.find((one) => one.id === ids.emailA);
      secondFacts = facts.find((one) => one.id === ids.emailA2);
      if (
        first?.messageId?.[0] !== messageId ||
        secondFacts?.messageId?.[0] !== secondId
      ) {
        throw new Error(
          `The imported messages read back with Message-IDs ${JSON.stringify(facts.map((one) => one.messageId))}.`,
        );
      }
    });
    await check("email:copy", "Copy one to the other account", async () => {
      const result = await copyEmails(ids.a, ids.b, [
        {
          id: ids.emailA,
          mailboxIds: { [ids.folderB]: true },
          keywords: { $seen: true },
          receivedAt: RECEIVED_AT,
        },
      ]);
      ids.emailB = result.created[ids.emailA] ?? "";
      if (!ids.emailB) {
        throw new Error(
          `Email/copy refused it: ${JSON.stringify(result.notCreated)}`,
        );
      }
      const [original] = await emailFacts(ids.a, [ids.emailA]);
      const [copy] = await emailFacts(ids.b, [ids.emailB]);
      if (
        !copy ||
        copy.size !== original.size ||
        copy.receivedAt !== original.receivedAt ||
        copy.messageId?.[0] !== original.messageId?.[0] ||
        copy.keywords.$seen !== true
      ) {
        throw new Error(
          `The copy differs from the original: ${JSON.stringify({ original, copy })}`,
        );
      }
    });
    await check(
      "email:by-message-id",
      "Find copies by Message-ID, two at once",
      async () => {
        const found = await emailsByMessageIds(ids.b, [messageId, secondId]);
        const hits = found.get(messageId) ?? [];
        if (hits.length !== 1 || hits[0].id !== ids.emailB) {
          throw new Error("The header filter did not find the copy.");
        }
        if (found.has(secondId)) {
          throw new Error(
            "The header filter matched a message that was not copied.",
          );
        }
      },
    );
    await check(
      "email:import-across",
      "Move the other one across by blob (the fallback when Email/copy is refused)",
      async () => {
        const id = await importAcross(ids.a, ids.b, secondFacts!, {
          [ids.folderB]: true,
        });
        const [copy] = await emailFacts(ids.b, [id]);
        if (
          copy?.messageId?.[0] !== secondId ||
          copy.size !== secondFacts!.size ||
          copy.receivedAt !== RECEIVED_AT
        ) {
          throw new Error(
            `The imported copy differs from the original: ${JSON.stringify({ original: secondFacts, copy })}`,
          );
        }
      },
    );
    await check(
      "sieve:personal",
      "Install and activate a personal script",
      async () => {
        await putSieveScript(ids.a, PERSONAL_SCRIPT, "keep;\n", true);
        if (!(await scriptNamed(ids.a, PERSONAL_SCRIPT))?.isActive) {
          throw new Error("The personal script did not become active.");
        }
      },
    );
    await check(
      "sieve:notice",
      "Install the retired-address rules around it, read them back, then remove them",
      async () => {
        const text = retiredNoticeScript({
          retired: [`${b}@${domain()}`],
          successor: `${a}@${domain()}`,
          forwardUntil: new Date(
            Date.now() + FORWARD_DAYS * 86_400_000,
          ).toISOString(),
          include: PERSONAL_SCRIPT,
        });
        await putSieveScript(ids.a, RETIRED_NOTICE_SCRIPT, text, true);
        const notice = await scriptNamed(ids.a, RETIRED_NOTICE_SCRIPT);
        if (!notice?.isActive) {
          throw new Error("The notice script did not become active.");
        }
        if ((await scriptNamed(ids.a, PERSONAL_SCRIPT))?.isActive) {
          throw new Error(
            "Activating the notice left the personal script active too.",
          );
        }
        if (!notice.blobId) {
          throw new Error("SieveScript/get returned no blobId to download.");
        }
        const readBack = await (
          await downloadBlob(
            adminAccess(ids.a),
            notice.blobId,
            RETIRED_NOTICE_SCRIPT,
            "application/sieve",
          )
        ).text();
        if (readBack !== text) {
          throw new Error(
            "The downloaded script differs from what was uploaded.",
          );
        }
        await removeSieveScript(ids.a, RETIRED_NOTICE_SCRIPT, PERSONAL_SCRIPT);
        if (await scriptNamed(ids.a, RETIRED_NOTICE_SCRIPT)) {
          throw new Error("The notice script is still there.");
        }
        if (!(await scriptNamed(ids.a, PERSONAL_SCRIPT))?.isActive) {
          throw new Error("The personal script was not activated again.");
        }
      },
    );
    await check(
      "sieve:reject",
      "Install the retired-sink rejection rule",
      async () => {
        await putSieveScript(
          ids.b,
          RETIRED_REJECT_SCRIPT,
          retiredRejectScript(),
          true,
        );
        if (!(await scriptNamed(ids.b, RETIRED_REJECT_SCRIPT))?.isActive) {
          throw new Error("The rejection script did not become active.");
        }
      },
    );
    await check("alias:add", "Add an alias to an account", async () => {
      await setAccountAliases(b, [alias], domain());
      if (!(await accountAliases(b)).includes(alias)) {
        throw new Error("The alias did not read back.");
      }
    });
    await check(
      "account:destroy",
      "Destroy a read-only account with an alias and an active script",
      async () => {
        await makeReadOnly(b);
        if (!(await destroyAccount(b)))
          throw new Error("Nothing was destroyed.");
        if (await localPartTaken(b)) throw new Error(`${b} still exists.`);
      },
    );
    await check(
      "alias:reissue",
      "Attach the destroyed account's address to the other one",
      async () => {
        await setAccountAliases(a, [b, alias], domain());
        const now = await accountAliases(a);
        if (!now.includes(b) || !now.includes(alias)) {
          throw new Error(`Aliases read back as: ${now.join(", ") || "none"}.`);
        }
      },
    );
  } finally {
    const failures: string[] = [];
    for (const name of [a, b]) {
      try {
        await destroyAccount(name);
      } catch (err) {
        failures.push(`${name}: ${err instanceof Error ? err.message : err}`);
      }
    }
    checks.push({
      id: "cleanup",
      label: "Remove the throwaway accounts",
      ok: !failures.length,
      error: failures.join("; ") || undefined,
    });
  }

  state.last = {
    at: new Date().toISOString(),
    ok: checks.every((one) => one.ok),
    checks,
  };
  return state.last;
};
