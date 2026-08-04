"use client";

import { useEffect, useState } from "react";

import {
  fetchCurrentExecs,
  fetchPreviousExecs,
  type ExecRecord,
  type WithKey,
} from "@/lib/api";
import { sortCurrentExecsByRoleThenDatabaseOrder } from "@/lib/execs/order";

import { TeamMemberCard } from "./components/team-member-card";

type TeamMember = WithKey<ExecRecord>;

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

        setCurrentExecs(sortCurrentExecsByRoleThenDatabaseOrder(current));
        setPreviousExecs(previous);
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
  const errorMessage = error ? (
    <p className="mb-4 text-muted-foreground">{error}</p>
  ) : null;

  return (
    <main className="min-h-screen bg-white pb-10">
      <section className="border-b border-border pb-5 pt-4">
        <h1 className="m-0 font-semibold leading-[1.05] text-[clamp(2.1rem,3.5vw,2.9rem)]">
          Our Team
        </h1>
        <p className="section-lead mt-2 max-w-[650px] pl-3 text-[0.92rem]">
          A unified community of student leaders, builders, and alumni dedicated
          to supporting computer science at Brock.
        </p>
      </section>

      <section className="mt-4 rounded-[16px] bg-white px-4 py-4">
        <h2 className="m-0 text-[1.75rem] font-semibold leading-[1.1]">
          Current Executives
        </h2>
        <p className="mb-3 mt-0 text-[0.9rem] font-semibold text-muted-foreground">
          The current leadership team.
        </p>

        {errorMessage}
        {loading && (
          <p className="mb-4 text-muted-foreground">Loading current team...</p>
        )}
        {!loading && !error && !hasCurrentExecs && (
          <p className="mb-4 text-muted-foreground">
            No current team members found.
          </p>
        )}

        {hasCurrentExecs && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {currentExecs.map((member) => (
              <TeamMemberCard key={member.$key} member={member} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-3 bg-white px-4 py-5">
        <h2 className="m-0 text-[1.75rem] font-semibold leading-[1.1]">
          Club Alumni
        </h2>
        <p className="mb-3 mt-0 text-[0.9rem] font-semibold text-muted-foreground">
          Past executives who helped shape the club.
        </p>

        {errorMessage}
        {loading && (
          <p className="mb-4 text-muted-foreground">Loading alumni...</p>
        )}
        {!loading && !error && !hasPreviousExecs && (
          <p className="mb-4 text-muted-foreground">No alumni records found.</p>
        )}

        {hasPreviousExecs && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
            {previousExecs.map((member) => (
              <TeamMemberCard isAlumni key={member.$key} member={member} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
