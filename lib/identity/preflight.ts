import { randomBytes } from "node:crypto";
import type { PreflightCheck, PreflightReport } from "@/lib/api/types";
import {
  copyEmails,
  createFolder,
  emailFacts,
  emailsByMessageIds,
  importBlob,
  listMailboxTree,
  uploadMessage,
} from "@/lib/mail/migrate-mail";
import { domain } from "@/lib/mail/provision";
import {
  accountAliases,
  createMailbox,
  destroyAccount,
  listSieveScripts,
  localPartTaken,
  putSieveScript,
  removeSieveScript,
  setAccountAliases,
} from "@/lib/mail/stalwart";
import { RETIRED_NOTICE_SCRIPT, retiredNoticeScript } from "./retired-notice";
import { FORWARD_DAYS } from "./step-list";

/**
 * Per process, on purpose: a Stalwart upgrade lands with a deploy, and every
 * call below is one the app never made before this feature. A real rename
 * refuses to start until an approver has watched these pass on this build.
 */
let last: PreflightReport | null = null;

export const lastPreflight = () => last;

export class PreflightRequired extends Error {
  constructor() {
    super(
      "Run the migration preflight first (People → Run migration preflight). It has to pass once per deploy before a real rename can start.",
    );
  }
}

export const requirePreflight = () => {
  if (last?.ok !== true) throw new PreflightRequired();
};

const RECEIVED_AT = "2024-01-01T00:00:00Z";

const message = (messageId: string) =>
  [
    `From: BrockCSC Preflight <security@${domain()}>`,
    `To: preflight@${domain()}`,
    "Subject: Migration preflight",
    `Message-ID: <${messageId}>`,
    "Date: Mon, 01 Jan 2024 00:00:00 +0000",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "This message exists only to test copying between accounts.",
    "",
  ].join("\r\n");

export const runPreflight = async (): Promise<PreflightReport> => {
  const tag = randomBytes(3).toString("hex");
  const a = `zz-preflight-${tag}-a`;
  const b = `zz-preflight-${tag}-b`;
  const alias = `zz-preflight-${tag}-alias`;
  const messageId = `preflight-${tag}@${domain()}`;
  const checks: PreflightCheck[] = [];
  let blocked = false;
  const ids = {
    a: "",
    b: "",
    folderA: "",
    folderB: "",
    emailA: "",
    emailB: "",
  };

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
    await check("mailbox:folders", "Read and create folders", async () => {
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
    });
    await check("email:import", "Import a message", async () => {
      const blobId = await uploadMessage(
        ids.a,
        new TextEncoder().encode(message(messageId)).buffer as ArrayBuffer,
      );
      ids.emailA = await importBlob(
        ids.a,
        blobId,
        { [ids.folderA]: true },
        { $seen: true },
        RECEIVED_AT,
      );
      const [facts] = await emailFacts(ids.a, [ids.emailA]);
      if (facts?.messageId?.[0] !== messageId) {
        throw new Error(
          `The imported message reads back with Message-ID ${JSON.stringify(facts?.messageId)}.`,
        );
      }
    });
    await check("email:copy", "Copy it to the other account", async () => {
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
    await check("email:by-message-id", "Find it by Message-ID", async () => {
      const found = await emailsByMessageIds(ids.b, [messageId]);
      if (found.get(messageId) !== ids.emailB) {
        throw new Error("The header filter did not find the copy.");
      }
    });
    await check(
      "sieve:notice",
      "Install, activate and remove the retired-address rules",
      async () => {
        await putSieveScript(
          ids.a,
          RETIRED_NOTICE_SCRIPT,
          retiredNoticeScript({
            retired: [`${b}@${domain()}`],
            successor: `${a}@${domain()}`,
            forwardUntil: new Date(
              Date.now() + FORWARD_DAYS * 86_400_000,
            ).toISOString(),
          }),
          true,
        );
        const script = (await listSieveScripts(ids.a)).find(
          (one) => one.name === RETIRED_NOTICE_SCRIPT,
        );
        if (!script?.isActive) {
          throw new Error("The notice script did not become active.");
        }
        await removeSieveScript(ids.a, RETIRED_NOTICE_SCRIPT);
      },
    );
    await check("alias:add", "Add an alias to an account", async () => {
      await setAccountAliases(b, [alias], domain());
      if (!(await accountAliases(b)).includes(alias)) {
        throw new Error("The alias did not read back.");
      }
    });
    await check("account:destroy", "Destroy an account", async () => {
      if (!(await destroyAccount(b))) throw new Error("Nothing was destroyed.");
      if (await localPartTaken(b)) throw new Error(`${b} still exists.`);
    });
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

  last = {
    at: new Date().toISOString(),
    ok: checks.every((one) => one.ok),
    checks,
  };
  return last;
};
