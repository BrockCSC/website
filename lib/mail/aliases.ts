import type { ExecRecord, SignupRecord } from "@/lib/api/types";
import { create, findAll, remove, update } from "@/lib/db/repository";
import { execsTable, mailAliasesTable, signupsTable } from "@/lib/db/schema";
import { ownsIdentities } from "@/lib/env";
import { coPresidentsList, domain } from "./provision";
import { expandRoles, roleGroups, type RoleGroup } from "./roles";
import { readMailSettings } from "./settings";
import {
  forwardingAccounts,
  getCatchAll,
  listMailingLists,
  listUsers,
  type MailingList,
  type MailUser,
} from "./stalwart";

export type Recipients = {
  people: string[];
  groups: string[];
  external: string[];
  /** Club roles: membership is recomputed rather than typed in. */
  roles: string[];
};

export type Delivered = {
  address: string;
  name: string | null;
  via: string[];
  direct: boolean;
};

export type Alias = {
  id: string;
  name: string;
  address: string;
  description: string;
  aliases: string[];
  recipients: Recipients;
  delivered: Delivered[];
  synced: boolean;
};

type Person = {
  username: string;
  address: string;
  name: string;
  readOnly: boolean;
  current: boolean;
};

export type AliasDirectory = {
  domain: string;
  aliases: Alias[];
  roleGroups: RoleGroup[];
  /** Addresses each role currently covers, so a draft can preview itself. */
  roleMembers: Record<string, string[]>;
  people: Person[];
  catchAll: string | null;
  forwarding: { address: string; name: string }[];
  /** Where read-only inboxes copy their mail, and who is left out. */
  forwardTo: string | null;
  forwardingOff: string[];
  identitiesEditable: boolean;
};

export type Draft = {
  name: string;
  description: string;
  aliases: string[];
  recipients: string[];
  roles: string[];
};

const LOCAL_PART = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_DESCRIPTION = 200;

const profiles = async () => {
  const [signups, execs] = await Promise.all([
    findAll<SignupRecord>(signupsTable),
    findAll<ExecRecord>(execsTable),
  ]);
  const byKey = new Map(execs.map((exec) => [exec.id, exec]));
  return new Map(
    signups
      .filter((signup) => signup.status === "approved" && signup.username)
      .map((signup) => {
        const exec = signup.execKey ? byKey.get(signup.execKey) : undefined;
        return [
          signup.username!,
          {
            name:
              exec?.name ??
              [signup.firstName, signup.lastName].filter(Boolean).join(" "),
            current: exec?.isCurrentExec === true,
          },
        ];
      }),
  );
};

const addressesOf = (list: MailingList) => [
  list.emailAddress,
  ...list.aliases.map((alias) => `${alias}@${domain()}`),
];

type RoleState = {
  /** Group ids each list carries, by list name. */
  byList: Map<string, string[]>;
  /** Addresses each group currently covers. */
  members: Map<string, string[]>;
};

const assemble = (
  lists: MailingList[],
  people: Person[],
  roles: RoleState,
): Alias[] => {
  const names = new Map(people.map((p) => [p.address, p.name]));
  const byAddress = new Map(
    lists.flatMap((list) => addressesOf(list).map((a) => [a, list] as const)),
  );

  const deliveries = (root: MailingList): Delivered[] => {
    const out = new Map<string, Delivered>();
    const walk = (list: MailingList, via: string[], seen: Set<string>) => {
      for (const address of list.recipients) {
        const nested = byAddress.get(address);
        if (nested) {
          if (!seen.has(nested.id)) {
            walk(nested, [...via, address], new Set([...seen, nested.id]));
          }
          continue;
        }
        const entry = out.get(address) ?? {
          address,
          name: names.get(address) ?? null,
          via: [],
          direct: false,
        };
        if (via.length === 0) entry.direct = true;
        else if (entry.via.length === 0) entry.via = via;
        out.set(address, entry);
      }
    };
    walk(root, [], new Set([root.id]));
    return [...out.values()];
  };

  const labels = new Map(roleGroups().map((group) => [group.id, group.label]));

  return lists
    .map((list) => {
      const carried = roles.byList.get(list.name) ?? [];
      const fromRoles = new Map<string, string[]>();
      for (const group of carried) {
        for (const address of roles.members.get(group) ?? []) {
          const via = fromRoles.get(address) ?? [];
          via.push(labels.get(group) ?? group);
          fromRoles.set(address, via);
        }
      }
      const typed = list.recipients.filter(
        (address) => !fromRoles.has(address),
      );

      return {
        id: list.id,
        name: list.name,
        address: list.emailAddress,
        description: list.description ?? "",
        aliases: list.aliases,
        recipients: {
          people: typed.filter((r) => names.has(r)),
          groups: typed.filter((r) => byAddress.has(r)),
          external: typed.filter((r) => !names.has(r) && !byAddress.has(r)),
          roles: carried,
        },
        delivered: deliveries(list).map((entry) => {
          const viaRoles = fromRoles.get(entry.address);
          if (!viaRoles) return entry;
          return {
            ...entry,
            direct: false,
            via: [...new Set([...entry.via, ...viaRoles])],
          };
        }),
        synced: list.name === coPresidentsList(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const readAliases = async (): Promise<AliasDirectory> => {
  const [lists, users, known, catchAll, forwarding, settings] =
    await Promise.all([
      listMailingLists(),
      listUsers(),
      profiles(),
      getCatchAll(domain()),
      forwardingAccounts(),
      readMailSettings(),
    ]);
  const person = (user: MailUser): Person => ({
    username: user.name,
    address: user.emailAddress,
    name: known.get(user.name)?.name || user.description || user.name,
    readOnly: user.readOnly,
    current: known.get(user.name)?.current ?? false,
  });
  const byName = (a: Person, b: Person) => a.name.localeCompare(b.name);
  const people = users.map(person).sort(byName);
  const byList = await storedRoles();
  const members = await expandRoles(
    roleGroups().map((group) => group.id),
    domain(),
  );

  return {
    domain: domain(),
    aliases: assemble(lists, people, { byList, members }),
    roleGroups: roleGroups(),
    roleMembers: Object.fromEntries(members),
    people,
    catchAll,
    forwarding: users
      .filter((user) => forwarding.has(user.name))
      .map(person)
      .sort(byName)
      .map(({ address, name }) => ({ address, name })),
    forwardTo: settings.forwardTo,
    forwardingOff: settings.forwardingOff,
    identitiesEditable: ownsIdentities(),
  };
};

type RoleRecord = { name: string; roles: string[] };

/** Group ids each alias carries, by alias name. */
const storedRoles = async (): Promise<Map<string, string[]>> =>
  new Map(
    (await findAll<RoleRecord>(mailAliasesTable)).map((row) => [
      row.name,
      row.roles ?? [],
    ]),
  );

export const setAliasRoles = async (
  name: string,
  roles: string[],
): Promise<void> => {
  const rows = await findAll<RoleRecord>(mailAliasesTable);
  const existing = rows.find((row) => row.name === name);
  if (!roles.length) {
    if (existing) await remove(mailAliasesTable, existing.id);
    return;
  }
  if (existing) await update(mailAliasesTable, existing.id, { name, roles });
  else await create(mailAliasesTable, { name, roles });
};

export const forgetAliasRoles = async (name: string): Promise<void> =>
  setAliasRoles(name, []);

/** Every address a saved alias should carry, roles expanded. */
export const recipientsFor = async (
  recipients: Recipients,
): Promise<string[]> => {
  const members = await expandRoles(recipients.roles, domain());
  return [
    ...new Set([
      ...recipients.people,
      ...recipients.groups,
      ...recipients.external,
      ...[...members.values()].flat(),
    ]),
  ];
};

const toList = (alias: Alias): MailingList => ({
  id: alias.id,
  name: alias.name,
  emailAddress: alias.address,
  description: alias.description,
  aliases: alias.aliases,
  recipients: [
    ...alias.recipients.people,
    ...alias.recipients.groups,
    ...alias.recipients.external,
  ],
});

/** The alias as it would read back once the draft is applied. */
export const previewAlias = (
  directory: AliasDirectory,
  draft: Draft,
  id: string,
): Alias => {
  const list: MailingList = {
    id,
    name: draft.name,
    emailAddress: `${draft.name}@${directory.domain}`,
    description: draft.description,
    aliases: draft.aliases,
    recipients: draft.recipients,
  };
  const others = directory.aliases.filter((a) => a.id !== id);
  const byList = new Map(
    others.map((alias) => [alias.name, alias.recipients.roles]),
  );
  byList.set(draft.name, draft.roles);
  return assemble([...others.map(toList), list], directory.people, {
    byList,
    members: new Map(Object.entries(directory.roleMembers)),
  }).find((a) => a.id === id)!;
};

const strings = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((v) => typeof v === "string")
    ? [...new Set(value.map((v) => v.trim().toLowerCase()))].filter(Boolean)
    : null;

const reaches = (
  address: string,
  targetId: string,
  byAddress: Map<string, Alias>,
  seen = new Set<string>(),
): boolean => {
  const list = byAddress.get(address);
  if (!list || seen.has(list.id)) return false;
  if (list.id === targetId) return true;
  seen.add(list.id);
  return list.recipients.groups.some((g) =>
    reaches(g, targetId, byAddress, seen),
  );
};

/** Normalised fields from a request body, or the reason they were refused. */
export const draftAlias = (
  body: Record<string, unknown>,
  directory: AliasDirectory,
  existing: Alias | null,
): { draft: Draft } | { error: string } => {
  const name =
    existing?.name ??
    (typeof body.name === "string" ? body.name.trim().toLowerCase() : "");
  if (!LOCAL_PART.test(name)) {
    return {
      error:
        "Names are lowercase letters, digits, dots, dashes or underscores, up to 64 long.",
    };
  }

  const localParts = new Set(
    directory.people.map((p) => p.address.split("@")[0]),
  );
  const taken = new Set<string>();
  for (const alias of directory.aliases) {
    if (alias.id === existing?.id) continue;
    taken.add(alias.name);
    for (const one of alias.aliases) taken.add(one);
  }
  const collides = (local: string) =>
    localParts.has(local) || taken.has(local)
      ? `${local}@${directory.domain} is already in use.`
      : null;
  if (!existing) {
    const clash = collides(name);
    if (clash) return { error: clash };
  }

  const description =
    body.description === undefined
      ? (existing?.description ?? "")
      : typeof body.description === "string"
        ? body.description.trim()
        : null;
  if (description === null || description.length > MAX_DESCRIPTION) {
    return {
      error: `Describe it in ${MAX_DESCRIPTION} characters or fewer.`,
    };
  }

  const aliases =
    body.aliases === undefined
      ? (existing?.aliases ?? [])
      : strings(body.aliases);
  if (!aliases) return { error: "Aliases must be a list of names." };
  for (const alias of aliases) {
    if (!LOCAL_PART.test(alias) || alias === name) {
      return { error: `"${alias}" is not a usable alias.` };
    }
    const clash = collides(alias);
    if (clash) return { error: clash };
  }

  let recipients: string[];
  let roles: string[] = existing?.recipients.roles ?? [];
  if (body.recipients === undefined) {
    if (!existing) return { error: "Say who receives the mail." };
    recipients = toList(existing).recipients;
  } else {
    const wanted = body.recipients as Partial<Recipients> | null;
    const people = strings(wanted?.people ?? []);
    const groups = strings(wanted?.groups ?? []);
    const external = strings(wanted?.external ?? []);
    if (!wanted || !people || !groups || !external) {
      return {
        error: "Recipients must list people, groups and external addresses.",
      };
    }
    const byAddress = new Map(
      directory.aliases.flatMap((a) =>
        [
          a.address,
          ...a.aliases.map((one) => `${one}@${directory.domain}`),
        ].map((address) => [address, a] as const),
      ),
    );
    const known = new Set(directory.people.map((p) => p.address));
    const stranger = people.find((p) => !known.has(p));
    if (stranger) return { error: `${stranger} has no club mailbox.` };
    const missing = groups.find((g) => !byAddress.has(g));
    if (missing) return { error: `${missing} is not a group.` };
    const bad = external.find((e) => !EMAIL.test(e));
    if (bad) return { error: `"${bad}" is not an email address.` };
    const wantedRoles = strings(wanted?.roles ?? []);
    if (!wantedRoles) return { error: "Roles must be a list of names." };
    const known3 = new Set(directory.roleGroups.map((group) => group.id));
    const unknown = wantedRoles.find((role) => !known3.has(role));
    if (unknown) return { error: `${unknown} is not a club role.` };
    roles = wantedRoles;
    if (existing && groups.some((g) => reaches(g, existing.id, byAddress))) {
      return { error: "That would make the group deliver to itself." };
    }
    const fromRoles = roles.flatMap(
      (role) => directory.roleMembers[role] ?? [],
    );
    recipients = [
      ...new Set([...people, ...groups, ...external, ...fromRoles]),
    ];
  }
  if (!recipients.length && !roles.length) {
    return { error: "Say who receives the mail." };
  }

  return { draft: { name, description, aliases, recipients, roles } };
};
