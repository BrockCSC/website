"use client";

import { Globe, UserCheck, Users } from "lucide-react";
import { Pill } from "../../users/ui";
import type { Alias, AliasDirectory, Delivered } from "./api";

export const groupOf = (directory: AliasDirectory, address: string) =>
  directory.aliases.find(
    (alias) =>
      alias.address === address ||
      alias.aliases.some((one) => `${one}@${directory.domain}` === address),
  );

const local = (address: string) => address.split("@")[0];

export const peopleCount = (count: number) =>
  `${count} ${count === 1 ? "person" : "people"}`;

/** One line for an alias row: who it reaches (the server's `delivered`) and its other names. */
export const aliasMeta = (alias: Alias) => {
  const parts = [
    alias.delivered.length
      ? `Reaches ${peopleCount(alias.delivered.length)}`
      : "Reaches nobody yet",
  ];
  if (alias.synced) parts.push("synced");
  if (alias.aliases.length) parts.push(`also ${alias.aliases.join(", ")}`);
  return parts.join(" · ");
};

const chip =
  "inline-flex items-center gap-1 rounded-full border-2 border-line px-2.5 py-0.5 text-xs font-bold";

export const DeliversTo = ({
  alias,
  directory,
}: {
  alias: Alias;
  directory: AliasDirectory;
}) => {
  const names = new Map(directory.people.map((p) => [p.address, p.name]));
  const roles = new Map(directory.roleGroups.map((g) => [g.id, g.label]));
  return (
    <span className="flex flex-wrap gap-1.5">
      {alias.recipients.roles.map((id) => (
        <span key={id} className={`${chip} bg-raised text-ink`}>
          <UserCheck className="size-3" />
          {roles.get(id) ?? id} ·{" "}
          {peopleCount(directory.roleMembers[id]?.length ?? 0)}
        </span>
      ))}
      {alias.recipients.people.map((address) => (
        <span
          key={address}
          title={address}
          className={`${chip} bg-tint text-ink`}
        >
          {names.get(address) ?? address}
        </span>
      ))}
      {alias.recipients.groups.map((address) => {
        const group = groupOf(directory, address);
        return (
          <span
            key={address}
            title={address}
            className={`${chip} bg-brand text-brand-ink`}
          >
            <Users className="size-3" />
            {group?.name ?? local(address)} · {group?.delivered.length ?? 0}{" "}
            people
          </span>
        );
      })}
      {alias.recipients.external.map((address) => (
        <span key={address} className={`${chip} bg-surface text-subtle`}>
          <Globe className="size-3" />
          {address}
        </span>
      ))}
    </span>
  );
};

export const DeliveredRows = ({ delivered }: { delivered: Delivered[] }) =>
  delivered.length ? (
    <ul className="flex flex-col gap-1.5">
      {delivered.map((entry) => (
        <li
          key={entry.address}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] border-2 border-line bg-surface px-3 py-2 text-sm"
        >
          <span className="min-w-0 font-extrabold wrap-anywhere text-ink">
            {entry.name ?? entry.address}
          </span>
          {entry.name && (
            <span className="min-w-0 font-mono wrap-anywhere text-subtle">
              {entry.address}
            </span>
          )}
          <span className="ml-auto flex flex-wrap gap-1.5">
            {entry.direct && <Pill>direct</Pill>}
            {entry.via.length > 0 && (
              <Pill tone="accent">via {entry.via.map(local).join(", ")}</Pill>
            )}
          </span>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-subtle">Nobody yet.</p>
  );
