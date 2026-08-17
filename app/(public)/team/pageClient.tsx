"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

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

import { RetryNotice, SearchField } from "../components/search-panel";
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

const matchesQuery = (member: TeamMember, query: string): boolean =>
  [member.name, member.title, member.term, member.description].some((field) =>
    field?.toLowerCase().includes(query),
  );

export default function TeamPageClient() {
  const [currentExecs, setCurrentExecs] = useState<TeamMember[]>([]);
  const [previousExecs, setPreviousExecs] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

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
  }, [reloadCount]);

  const appliedQuery = useDeferredValue(query);
  const normalizedQuery = appliedQuery.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;
  const resultsClass = `transition-opacity duration-[var(--dur)] ease-smooth ${
    appliedQuery === query ? "opacity-100" : "opacity-60"
  }`;
  const visibleCurrentExecs = useMemo(
    () =>
      normalizedQuery
        ? currentExecs.filter((member) => matchesQuery(member, normalizedQuery))
        : currentExecs,
    [currentExecs, normalizedQuery],
  );
  const visiblePreviousExecs = useMemo(
    () =>
      normalizedQuery
        ? previousExecs.filter((member) =>
            matchesQuery(member, normalizedQuery),
          )
        : previousExecs,
    [previousExecs, normalizedQuery],
  );
  const hasCurrentExecs = visibleCurrentExecs.length > 0;
  const hasPreviousExecs = visiblePreviousExecs.length > 0;
  const previousExecGroups = useMemo(
    () =>
      groupPreviousExecsByTerm(visiblePreviousExecs).map((group) => ({
        ...group,
        items: group.members,
      })),
    [visiblePreviousExecs],
  );
  const alumni = useRevealedGroups(previousExecGroups, 10, isSearching);
  const totalPeople = currentExecs.length + previousExecs.length;
  const matchCount = visibleCurrentExecs.length + visiblePreviousExecs.length;

  return (
    <main className="min-h-screen bg-surface pb-10">
      <section className="animate-rise-in border-b border-line/25 pb-5 pt-4">
        <h1 className="m-0 font-semibold leading-[1.05] text-[clamp(2.1rem,3.5vw,2.9rem)]">
          Our Team
        </h1>
        <p className="section-lead mt-2 max-w-[650px] pl-3 text-[0.92rem]">
          A unified community of student leaders, builders, and alumni dedicated
          to supporting computer science at Brock.
        </p>
      </section>

      {!loading && !error && totalPeople > 0 && (
        <SearchField
          ariaLabel="Search team members"
          onQueryChange={setQuery}
          placeholder="Search by name, role or term"
          query={query}
          results={
            isSearching && (
              <>
                {matchCount} of {totalPeople} people
              </>
            )
          }
        />
      )}

      <div className={resultsClass}>
        {isSearching && matchCount === 0 && (
          <section className="animate-fade-in mt-3 rounded-[16px] border-2 border-dashed border-line/25 bg-surface px-4 py-8 text-center">
            <h2 className="m-0 font-semibold text-[1.35rem] leading-[1.1]">
              Nobody matches &ldquo;{appliedQuery.trim()}&rdquo;
            </h2>
            <p className="mx-auto mt-2 mb-4 max-w-[38rem] text-[0.9rem] text-subtle">
              Try a first name on its own, a role like &ldquo;President&rdquo;,
              or a term like &ldquo;2019&rdquo;.
            </p>
            <Button onClick={() => setQuery("")} variant="primary">
              Clear search
            </Button>
          </section>
        )}

        <section
          className={`mt-4 rounded-[16px] bg-surface px-0 py-4 sm:px-4 ${
            isSearching && !hasCurrentExecs ? "hidden" : ""
          }`}
        >
          <h2 className="m-0 text-[1.75rem] font-semibold leading-[1.1]">
            Current Executives
          </h2>
          <p className="mb-3 mt-0 text-[0.9rem] font-semibold text-subtle">
            The current leadership team.
          </p>

          <RetryNotice
            message={error}
            onRetry={() => setReloadCount((count) => count + 1)}
          />
          {loading && (
            <div
              aria-busy="true"
              aria-label="Loading current team"
              className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4"
              role="status"
            >
              {[0, 1, 2, 3].map((index) => (
                <div
                  className="animate-pulse overflow-hidden rounded-[16px] border-2 border-line/25 bg-raised"
                  key={index}
                >
                  <div className="aspect-[4/3] bg-line/10" />
                  <div className="h-[5.5rem]" />
                </div>
              ))}
            </div>
          )}
          {!loading && !error && !hasCurrentExecs && !isSearching && (
            <p className="mb-4 text-subtle">No current team members found.</p>
          )}

          {hasCurrentExecs && (
            <div className="animate-fade-in grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {visibleCurrentExecs.map((member) => (
                <TeamMemberCard key={member.$key} member={member} />
              ))}
            </div>
          )}
        </section>

        <section
          className={`mt-3 bg-surface px-0 py-5 sm:px-4 ${
            error || (isSearching && !hasPreviousExecs) ? "hidden" : ""
          }`}
        >
          <h2 className="m-0 text-[1.75rem] font-semibold leading-[1.1]">
            Club Alumni
          </h2>
          <p className="mb-3 mt-0 text-[0.9rem] font-semibold text-subtle">
            Past executives who helped shape the club.
          </p>

          {loading && <p className="mb-4 text-subtle">Loading alumni...</p>}
          {!loading && !error && !hasPreviousExecs && !isSearching && (
            <p className="mb-4 text-subtle">No alumni records found.</p>
          )}

          {hasPreviousExecs && (
            <div className="flex flex-col gap-4">
              {alumni.visible.map((group) => (
                <section className="animate-rise-in" key={group.term}>
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
                  <Button onClick={alumni.revealAll} size="sm" variant="ghost">
                    Show all {alumni.hidden}
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

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
