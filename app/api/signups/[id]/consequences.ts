import type { ExecRecord, SignupRecord } from "@/lib/api/types";
import {
  assignRealmRole,
  effectiveRealmRoles,
  removeRealmRole,
  usersWithRealmRole,
} from "@/lib/auth/keycloak-admin";
import { invalidateRoles } from "@/lib/auth/session";
import { findById, update } from "@/lib/db/repository";
import { execsTable, signupsTable } from "@/lib/db/schema";
import { ownsIdentities } from "@/lib/env";
import {
  isProtectedMailbox,
  makeMailboxReadOnly,
  provisionMailbox,
  syncAdminGroup,
} from "@/lib/mail/provision";
import { localPartTaken } from "@/lib/mail/stalwart";

type Entity<T> = T & { id: string };

/**
 * One vocabulary for every change that touches an identity. The detail view,
 * the single-click role and mailbox buttons and the lifecycle confirmation all
 * post the same ids, so a caller can always apply part of a bundle.
 */
export type Consequence = {
  id: string;
  group: "role" | "mailbox" | "tile";
  title: string;
  detail: string;
  /** Set when the change cannot be made; the reason is shown and never applied. */
  blocked?: string;
};

type Item = Consequence & { run: () => Promise<unknown> };

export type Person = {
  signup: Entity<SignupRecord> | null;
  exec: Entity<ExecRecord> | null;
};

const CO_PRESIDENT = "co-president";
const execRole = () => process.env.ADMIN_ROLE ?? "executive";
const alumniRole = () => process.env.ALUMNI_ROLE ?? "alumni";

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

/**
 * Outside production these are rehearsed rather than refused: the plan, the
 * ticking and the ordering are all real, and only the write is withheld. The
 * shared realm and the one mail server are why the write cannot happen.
 */
const rehearsed = (group: Consequence["group"]) =>
  !ownsIdentities() && group !== "tile";

/** id is a sign-up id, or an exec id for a tile that has no account. */
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
    // Unknown counts as last: losing the only approver is not recoverable here.
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
      if (name === CO_PRESIDENT) await syncAdminGroup();
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
      blocked: provisioned === false ? "There is no mailbox yet." : shielded,
      run: () => makeMailboxReadOnly(username),
    },
    {
      id: "mailbox:provision",
      group: "mailbox",
      title: `Provision ${address}`,
      detail:
        "Creates the mailbox if it is missing, lifts any read-only block and approves it for sending.",
      blocked: shielded,
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
  const past = exec.isCurrentExec === false;
  return [
    {
      id: past ? "tile:current" : "tile:past",
      group: "tile",
      title: past
        ? "Move their tile back to the current team"
        : "Move their tile to past executives",
      detail: past
        ? "They appear again under the current executive team."
        : "They drop off the current team and appear under past executives.",
      run: () => update(execsTable, exec.id, { isCurrentExec: !past }),
    },
  ];
};

export type PersonDetail = {
  signup: (SignupRecord & { $key: string }) | null;
  exec: (ExecRecord & { $key: string }) | null;
  /** Null when Keycloak could not be read; the UI says so rather than guessing. */
  roles: string[] | null;
  managedRoles: string[];
  mailbox: {
    address: string | null;
    provisioned: boolean | null;
    protected: boolean;
    /** Derived from the tile: past executives are made read-only when moved. */
    readOnly: boolean;
  };
  identitiesEditable: boolean;
  consequences: Consequence[];
  /** The lifecycle move on offer, as an ordered slice of `consequences`. */
  transition: { to: "former" | "current"; label: string; ids: string[] } | null;
};

type Plan = {
  items: Item[];
  held: string[] | null;
  provisioned: boolean | null;
};

const plan = async ({ signup, exec }: Person): Promise<Plan> => {
  if (!signup) {
    return { items: tileItems(exec), held: null, provisioned: null };
  }

  const [held, coPresidents, provisioned] = await Promise.all([
    signup.keycloakUserId
      ? effectiveRealmRoles(signup.keycloakUserId).catch(() => null)
      : null,
    usersWithRealmRole(CO_PRESIDENT).catch(() => null),
    mailboxProvisioned(signup),
  ]);
  const address = mailAddress(signup);

  return {
    items: [
      ...(held ? roleItems(signup, held, coPresidents) : []),
      ...(address ? mailboxItems(signup, address, provisioned) : []),
      ...tileItems(exec),
    ],
    held,
    provisioned,
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

const stated = ({ id, group, title, detail, blocked }: Item): Consequence => ({
  id,
  group,
  title,
  detail,
  blocked,
});

const wire = <T>(entity: (T & { id: string }) | null) => {
  if (!entity) return null;
  const { id, ...rest } = entity;
  return { $key: id, ...rest } as T & { $key: string };
};

export const describePerson = async (person: Person): Promise<PersonDetail> => {
  const { signup, exec } = person;
  const { items, held, provisioned } = await plan(person);

  return {
    signup: wire(signup),
    exec: wire(exec),
    roles: held,
    managedRoles: managedRoles().map((role) => role.name),
    mailbox: {
      address: signup ? mailAddress(signup) : null,
      provisioned,
      protected: !!signup?.username && isProtectedMailbox(signup.username),
      readOnly: exec?.isCurrentExec === false,
    },
    identitiesEditable: ownsIdentities(),
    consequences: items.map(stated),
    transition: transitionFor(exec, items),
  };
};

export type ApplyResult = {
  applied: string[];
  /** Ticked and ordered as usual, but the write was withheld outside production. */
  rehearsed: string[];
  /** Requested but no longer offered, or blocked. Never silently treated as done. */
  skipped: string[];
  failed: { id: string; error: string }[];
};

/** Applies only what was asked for, in catalogue order so roles settle before mail. */
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
