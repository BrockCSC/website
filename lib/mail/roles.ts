import type { ExecRecord, SignupRecord } from "@/lib/api/types";
import { findAll } from "@/lib/db/repository";
import { execsTable, signupsTable } from "@/lib/db/schema";
import { ACTIVE_TITLES } from "@/lib/execs/titles";

export type RoleGroup = { id: string; label: string; detail: string };

const titleId = (title: string) =>
  `title:${title.trim().toLowerCase().replace(/\s+/g, "-")}`;

export const roleGroups = (): RoleGroup[] => [
  {
    id: "current",
    label: "All current executives",
    detail: "Everyone on the team page today",
  },
  {
    id: "past",
    label: "All past executives",
    detail: "Their mailboxes are read-only",
  },
  ...ACTIVE_TITLES.map((title) => ({
    id: titleId(title),
    label: title === "Executive" ? "Executives (title)" : `${title}s`,
    detail: `Whoever currently holds ${title}`,
  })),
];

const matches = (group: string, exec: ExecRecord): boolean => {
  const current = exec.isCurrentExec !== false;
  if (group === "current") return current;
  if (group === "past") return !current;
  return current && titleId(exec.title ?? "") === group;
};

/** Club addresses of everyone the named groups currently cover. */
export const expandRoles = async (
  groups: string[],
  domain: string,
): Promise<Map<string, string[]>> => {
  const covered = new Map<string, string[]>();
  if (!groups.length) return covered;

  const [execs, signups] = await Promise.all([
    findAll<ExecRecord>(execsTable),
    findAll<SignupRecord>(signupsTable),
  ]);
  const usernameOf = new Map(
    signups
      .filter((signup) => signup.status === "approved" && signup.username)
      .map((signup) => [signup.execKey, signup.username!]),
  );

  for (const group of groups) {
    const addresses = execs
      .filter((exec) => matches(group, exec))
      .flatMap((exec) => {
        const username = usernameOf.get(exec.id);
        return username ? [`${username}@${domain}`] : [];
      });
    covered.set(group, [...new Set(addresses)]);
  }
  return covered;
};
