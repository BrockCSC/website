import type { ExecRecord, SignupRecord } from "@/lib/api/types";
import {
  assignRealmRole,
  effectiveRealmRoles,
  removeRealmRole,
  usersWithRealmRole,
} from "@/lib/auth/keycloak-admin";
import { alumniRole, CO_PRESIDENT, execRole } from "@/lib/auth/capabilities";
import { invalidateRoles } from "@/lib/auth/session";
import {
  type Entity,
  findById,
  toWireRecord,
  update,
} from "@/lib/db/repository";
import { execsTable, signupsTable } from "@/lib/db/schema";
import { ownsIdentities } from "@/lib/env";
import {
  isProtectedMailbox,
  makeMailboxReadOnly,
  provisionMailbox,
  syncAdminGroup,
  syncExpungeRights,
} from "@/lib/mail/provision";
import { isReadOnly, localPartTaken } from "@/lib/mail/stalwart";

export type Consequence = {
  id: string;
  group: "role" | "mailbox" | "tile";
  title: string;
  detail: string;
  blocked?: string;
};

type Item = Consequence & { run: () => Promise<unknown> };

export type Person = {
  signup: Entity<SignupRecord> | null;
  exec: Entity<ExecRecord> | null;
};

const managedRoles = () => [
  {
    name: execRole(),
    label: "executive",
    grants: "Signs in to the admin area, runs events and mail.",
    revokes: "They lose the admin area; only their own tile stays editable.",
  },
  {
    name: alumniRole(),
    label: "alumni",
    grants: "Keeps them able to edit their own tile, nothing else.",
    revokes: "They can no longer sign in at all once executive is gone too.",
  },
  {
    name: CO_PRESIDENT,
    label: "co-president",
    grants: "Approval rights over sign-ups, and a seat on admin@.",
    revokes: "Approval rights end immediately and admin@ is recomputed.",
  },
];

const rehearsed = (group: Consequence["group"]) =>
  !ownsIdentities() && group !== "tile";

export const findPerson = async (id: string): Promise<Person | null> => {
  const signup = await findById<SignupRecord>(signupsTable, id);
  if (signup) {
    return {
      signup,
      exec: signup.execKey
        ? await findById<ExecRecord>(execsTable, signup.execKey)
        : null,
    };
  }
  const exec = await findById<ExecRecord>(execsTable, id);
  return exec ? { signup: null, exec } : null;
};

const roleItems = (
  signup: Entity<SignupRecord>,
  held: string[],
  coPresidents: { id: string }[] | null,
): Item[] => {
  const userId = signup.keycloakUserId;
  if (!userId) return [];

  return managedRoles().map(({ name, label, grants, revokes }) => {
    const has = held.includes(name);
    const last =
      has && name === CO_PRESIDENT
        ? coPresidents === null
          ? "Keycloak could not say how many co-presidents there are."
          : coPresidents.length <= 1 &&
              coPresidents.some((holder) => holder.id === userId)
            ? "There must always be at least one co-president."
            : undefined
        : undefined;

    const run = async () => {
      if (has) await removeRealmRole(userId, name);
      else await assignRealmRole(userId, name);
      if (name === CO_PRESIDENT) {
        await syncAdminGroup();
        await syncExpungeRights();
      }
      invalidateRoles(userId);
    };

    return {
      id: `role:${name}:${has ? "remove" : "add"}`,
      group: "role" as const,
      title: `${has ? "Remove" : "Add"} the ${label} role`,
      detail: has ? revokes : grants,
      blocked: last,
      run,
    };
  });
};

const mailboxItems = (
  signup: Entity<SignupRecord>,
  address: string,
  provisioned: boolean | null,
  readOnly: boolean,
): Item[] => {
  const username = signup.username!;
  const shielded = isProtectedMailbox(username)
    ? `${address} is a service account and cannot be changed.`
    : undefined;

  return [
    {
      id: "mailbox:readonly",
      group: "mailbox",
      title: `Make ${address} read-only`,
      detail: "They keep the inbox and everything in it, but cannot send.",
      blocked:
        shielded ??
        (provisioned === false
          ? "There is no mailbox yet."
          : readOnly
            ? `${address} is already read-only.`
            : undefined),
      run: () => makeMailboxReadOnly(username),
    },
    {
      id: "mailbox:provision",
      group: "mailbox",
      title: `Provision ${address}`,
      detail:
        "Creates the mailbox if it is missing, lifts any read-only block and approves it for sending.",
      blocked:
        shielded ??
        (provisioned && !readOnly
          ? `${address} already exists and may send.`
          : undefined),
      run: () =>
        provisionMailbox({
          username,
          firstName: signup.firstName ?? "",
          lastName: signup.lastName ?? "",
        }),
    },
  ];
};

const tileItems = (exec: Entity<ExecRecord> | null): Item[] => {
  if (!exec) return [];
  const toCurrent = exec.isCurrentExec === false;
  return [
    {
      id: toCurrent ? "tile:current" : "tile:past",
      group: "tile",
      title: toCurrent
        ? "Move their tile back to the current team"
        : "Move their tile to past executives",
      detail: toCurrent
        ? "They appear again under the current executive team."
        : "They drop off the current team and appear under past executives.",
      run: () => update(execsTable, exec.id, { isCurrentExec: toCurrent }),
    },
  ];
};

export type PersonDetail = {
  signup: (SignupRecord & { $key: string }) | null;
  exec: (ExecRecord & { $key: string }) | null;
  roles: string[] | null;
  managedRoles: string[];
  mailbox: {
    address: string | null;
    provisioned: boolean | null;
    protected: boolean;
    readOnly: boolean;
  };
  identitiesEditable: boolean;
  consequences: Consequence[];
  transition: { to: "former" | "current"; label: string; ids: string[] } | null;
};

type Plan = {
  items: Item[];
  held: string[] | null;
  provisioned: boolean | null;
  readOnly: boolean | null;
};

const plan = async ({ signup, exec }: Person): Promise<Plan> => {
  if (!signup) {
    return {
      items: tileItems(exec),
      held: null,
      provisioned: null,
      readOnly: null,
    };
  }

  const [held, coPresidents, provisioned, readOnly] = await Promise.all([
    signup.keycloakUserId
      ? effectiveRealmRoles(signup.keycloakUserId).catch(() => null)
      : null,
    usersWithRealmRole(CO_PRESIDENT).catch(() => null),
    mailboxProvisioned(signup),
    signup.username
      ? isReadOnly(signup.username).catch(() => null)
      : Promise.resolve(null),
  ]);
  const address = mailAddress(signup);

  return {
    items: [
      ...(held ? roleItems(signup, held, coPresidents) : []),
      ...(address
        ? mailboxItems(
            signup,
            address,
            provisioned,
            readOnly ?? exec?.isCurrentExec === false,
          )
        : []),
      ...tileItems(exec),
    ],
    held,
    provisioned,
    readOnly,
  };
};

const mailAddress = (signup: SignupRecord) =>
  signup.username
    ? `${signup.username}@${process.env.MAIL_DOMAIN ?? "brockcsc.ca"}`
    : null;

const mailboxProvisioned = async (signup: SignupRecord) =>
  signup.username
    ? await localPartTaken(signup.username).catch(() => null)
    : null;

const transitionFor = (
  exec: Entity<ExecRecord> | null,
  items: Item[],
): PersonDetail["transition"] => {
  if (!exec) return null;
  const back = exec.isCurrentExec === false;
  const wanted = back
    ? [
        "tile:current",
        `role:${execRole()}:add`,
        `role:${alumniRole()}:remove`,
        "mailbox:provision",
      ]
    : [
        "tile:past",
        "mailbox:readonly",
        `role:${execRole()}:remove`,
        `role:${alumniRole()}:add`,
        `role:${CO_PRESIDENT}:remove`,
      ];
  const ids = wanted.filter((id) => items.some((item) => item.id === id));
  if (!ids.length) return null;
  return {
    to: back ? "current" : "former",
    label: back ? "Return to the current team" : "Move to former executive",
    ids,
  };
};

const stated = ({ run, ...rest }: Item): Consequence => rest;

const wire = <T>(entity: Entity<T> | null) =>
  entity ? (toWireRecord(entity) as T & { $key: string }) : null;

export const describePerson = async (person: Person): Promise<PersonDetail> => {
  const { signup, exec } = person;
  const { items, held, provisioned, readOnly } = await plan(person);

  return {
    signup: wire(signup),
    exec: wire(exec),
    roles: held,
    managedRoles: managedRoles().map((role) => role.name),
    mailbox: {
      address: signup ? mailAddress(signup) : null,
      provisioned,
      protected: !!signup?.username && isProtectedMailbox(signup.username),
      readOnly: readOnly ?? exec?.isCurrentExec === false,
    },
    identitiesEditable: ownsIdentities(),
    consequences: items.map(stated),
    transition: transitionFor(exec, items),
  };
};

export type ApplyResult = {
  applied: string[];
  rehearsed: string[];
  skipped: string[];
  failed: { id: string; error: string }[];
};

export const applyConsequences = async (
  person: Person,
  requested: string[],
): Promise<ApplyResult> => {
  const wanted = new Set(requested);
  const { items } = await plan(person);
  const result: ApplyResult = {
    applied: [],
    rehearsed: [],
    skipped: [],
    failed: [],
  };

  for (const id of wanted) {
    if (!items.some((item) => item.id === id && !item.blocked)) {
      result.skipped.push(id);
    }
  }
  for (const item of items) {
    if (!wanted.has(item.id) || item.blocked) continue;
    if (rehearsed(item.group)) {
      result.rehearsed.push(item.id);
      continue;
    }
    try {
      await item.run();
      result.applied.push(item.id);
    } catch (err) {
      result.failed.push({
        id: item.id,
        error: err instanceof Error ? err.message : "Failed.",
      });
    }
  }
  return result;
};
