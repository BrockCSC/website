import type { ExecRecord, WithKey } from "@/lib/api/types";

type TeamMember = WithKey<ExecRecord>;

const UNKNOWN_ROLE_PRIORITY = Number.MAX_SAFE_INTEGER;

const ROLE_PRIORITY: Record<string, number> = {
  president: 1,
  "co-president": 2,
  "vice president": 3,
  treasurer: 4,
  executive: 5,
};

const getRolePriority = (title?: string): number => {
  const normalizedTitle = title?.trim().toLowerCase() ?? "";
  return ROLE_PRIORITY[normalizedTitle] ?? UNKNOWN_ROLE_PRIORITY;
};

/** Leading year of a term like "2016-2017", or -1 when there isn't one. */
export const termStartYear = (term: string): number =>
  Number(term.match(/\d{4}/)?.[0] ?? -1);

export const sortExecsByRoleThenDatabaseOrder = (
  members: TeamMember[],
): TeamMember[] => {
  const orderByKey = new Map<string, number>();
  members.forEach((member, index) => {
    orderByKey.set(member.$key, index);
  });

  return [...members].sort((a, b) => {
    const byRole = getRolePriority(a.title) - getRolePriority(b.title);
    if (byRole !== 0) {
      return byRole;
    }

    const aOrder = orderByKey.get(a.$key) ?? 0;
    const bOrder = orderByKey.get(b.$key) ?? 0;
    return aOrder - bOrder;
  });
};
