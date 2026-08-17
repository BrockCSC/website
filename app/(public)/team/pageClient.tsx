"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRevealedGroups } from "@/lib/use-revealed-groups";

import {
  fetchCurrentExecs,
  fetchPreviousExecs,
  type ExecRecord,
  type WithKey,
} from "@/lib/api";
import {
  sortExecsByRoleThenDatabaseOrder,
  termStartYear,
} from "@/lib/execs/order";

import { TeamMemberCard } from "./components/team-member-card";

type TeamMember = WithKey<ExecRecord>;

const UNDATED_TERM = "Previous Executives";

const groupPreviousExecsByTerm = (
  execs: TeamMember[],
): { term: string; members: TeamMember[] }[] => {
  const groups = new Map<string, TeamMember[]>();

  for (const member of execs) {
    const term = member.term?.trim() || UNDATED_TERM;
    const existing = groups.get(term);
    if (existing) {
      existing.push(member);
    } else {
      groups.set(term, [member]);
    }
  }

  const dated = Array.from(groups.entries())
    .filter(([term]) => term !== UNDATED_TERM)
    .sort(
      ([a], [b]) => termStartYear(b) - termStartYear(a) || b.localeCompare(a),
    );
  const undated = groups.get(UNDATED_TERM);

  return [...dated, ...(undated ? [[UNDATED_TERM, undated] as const] : [])].map(
    ([term, members]) => ({
      term,
      members: sortExecsByRoleThenDatabaseOrder(members),
    }),
  );
};

export default function TeamPageClient() {
  const [currentExecs, setCurrentExecs] = useState<TeamMember[]>([]);
  const [previousExecs, setPreviousExecs] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadTeam = async () => {
      setLoading(true);
      setError(null);

      try {
        const [current, previous] = await Promise.all([
          fetchCurrentExecs(),
          fetchPreviousExecs(),
        ]);

        if (!active) {
          return;
        }

        setCurrentExecs(
          sortExecsByRoleThenDatabaseOrder(
            current.filter((exec) => !exec.hidden),
          ),
        );
        setPreviousExecs(previous.filter((exec) => !exec.hidden));
      } catch {
        if (!active) {
          return;
        }
        setError("Could not load team members right now.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadTeam();

    return () => {
      active = false;
    };
  }, []);

  const hasCurrentExecs = currentExecs.length > 0;
  const hasPreviousExecs = previousExecs.length > 0;
  const previousExecGroups = useMemo(
    () =>
      groupPreviousExecsByTerm(previousExecs).map((group) => ({
        ...group,
        items: group.members,
      })),
    [previousExecs],
  );
  const alumni = useRevealedGroups(previousExecGroups);
  const errorMessage = error ? (
    <p className="mb-4 text-subtle">{error}</p>
  ) : null;

  return (
    <main className="min-h-screen bg-surface pb-10">
      <section className="border-b border-line/25 pb-5 pt-4">
        <h1 className="m-0 font-semibold leading-[1.05] text-[clamp(2.1rem,3.5vw,2.9rem)]">
          Our Team
        </h1>
        <p className="section-lead mt-2 max-w-[650px] pl-3 text-[0.92rem]">
          A unified community of student leaders, builders, and alumni dedicated
          to supporting computer science at Brock.
        </p>
      </section>

      <section className="mt-4 rounded-[16px] bg-surface px-0 py-4 sm:px-4">
        <h2 className="m-0 text-[1.75rem] font-semibold leading-[1.1]">
          Current Executives
        </h2>
        <p className="mb-3 mt-0 text-[0.9rem] font-semibold text-subtle">
          The current leadership team.
        </p>

        {errorMessage}
        {loading && <p className="mb-4 text-subtle">Loading current team...</p>}
        {!loading && !error && !hasCurrentExecs && (
          <p className="mb-4 text-subtle">No current team members found.</p>
        )}

        {hasCurrentExecs && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {currentExecs.map((member) => (
              <TeamMemberCard key={member.$key} member={member} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-3 bg-surface px-0 py-5 sm:px-4">
        <h2 className="m-0 text-[1.75rem] font-semibold leading-[1.1]">
          Club Alumni
        </h2>
        <p className="mb-3 mt-0 text-[0.9rem] font-semibold text-subtle">
          Past executives who helped shape the club.
        </p>

        {errorMessage}
        {loading && <p className="mb-4 text-subtle">Loading alumni...</p>}
        {!loading && !error && !hasPreviousExecs && (
          <p className="mb-4 text-subtle">No alumni records found.</p>
        )}

        {hasPreviousExecs && (
          <div className="flex flex-col gap-4">
            {alumni.visible.map((group) => (
              <section key={group.term}>
                <h3 className="mb-2 text-base font-semibold text-ink/80">
                  {group.term}
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
                  {group.members.map((member) => (
                    <TeamMemberCard
                      isAlumni
                      key={member.$key}
                      member={member}
                    />
                  ))}
                </div>
              </section>
            ))}

            {alumni.hasMore && (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Button onClick={alumni.revealMore} variant="outline">
                  Show earlier executives
                </Button>
                <span className="text-sm text-subtle">
                  {alumni.hidden} more
                </span>
              </div>
            )}
          </div>
        )}
      </section>

      <p className="px-0 text-[0.85rem] text-subtle sm:px-4">
        Are you an exec?{" "}
        <Link href="/signup" className="underline">
          Request an account
        </Link>{" "}
        or{" "}
        <Link href="/admin" className="underline">
          sign in
        </Link>
        .
      </p>
    </main>
  );
}
