"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Users, FileText, User } from "lucide-react";
import { InfoCardButton } from "@/components/ui/info-card-button";
import { fetchCurrentExecs, type ExecRecord, type WithKey } from "@/lib/api";

export function AboutUsSection() {
  const [execs, setExecs] = useState<WithKey<ExecRecord>[]>([]);

  useEffect(() => {
    let active = true;
    const loadExecs = async () => {
      try {
        const data = await fetchCurrentExecs();
        if (active) {
          setExecs(data);
        }
      } catch (error) {
        console.error("Failed to load execs", error);
      }
    };

    void loadExecs();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section id="about" className="w-full relative">
      <div className="max-w-7xl mx-auto px-1 py-14 sm:px-8 sm:py-24 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div className="flex flex-col gap-6">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            About Us
          </h2>
          <div className="w-16 h-1.5 bg-brand" />

          <p className="text-lg text-subtle font-medium leading-relaxed">
            We are the{" "}
            <span className="text-brand font-bold">
              Brock Computer Science Club
            </span>
            . Our goal is to provide a community for all individuals who are
            interested in Computer Science at Brock University.
          </p>
          <p className="text-lg text-subtle font-medium leading-relaxed">
            Throughout the year, we host and participate in several educational
            and social events related to Computer Science. We bridge the gap
            between academic theory and practical application.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            <InfoCardButton
              icon={Users}
              title="Meet the Team"
              subtitle="Learn about our execs"
              href="/team"
            />
            <InfoCardButton
              icon={FileText}
              title="CS Student Guide"
              subtitle="Courses, programs and advice"
              href="/cs-guide"
            />
          </div>
        </div>

        <div className="relative w-full max-w-[500px] mx-auto hidden md:flex items-center justify-center">
          <div className="flex flex-wrap justify-center gap-3 md:gap-4">
            {execs.map((exec, index) => (
              <div
                key={exec.$key}
                className="animate-fade-in relative z-0 hover:z-30 group flex justify-center"
                style={{ animationDelay: `${Math.min(index, 5) * 20}ms` }}
              >
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full border-[3px] border-line bg-raised flex items-center justify-center overflow-hidden shadow-[3px_3px_0_0_var(--brand)] transition-transform duration-[var(--dur)] ease-smooth group-hover:-translate-y-1 motion-reduce:group-hover:translate-y-0">
                  {exec.image?.url ? (
                    <Image
                      src={exec.image.url}
                      alt={exec.name || "Exec Member"}
                      fill
                      unoptimized
                      className="object-cover transition-transform duration-[var(--dur)] ease-smooth group-hover:scale-110"
                    />
                  ) : (
                    <User
                      strokeWidth={2.5}
                      className="w-8 h-8 text-subtle gap-0"
                    />
                  )}
                </div>

                {exec.name && (
                  <div className="absolute -bottom-10 translate-y-1 opacity-0 transition-[opacity,transform] duration-[var(--dur)] ease-smooth group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:translate-y-0 z-50 whitespace-nowrap bg-surface border-2 border-line text-ink text-xs font-bold px-3 py-1.5 rounded-[8px] shadow-[2px_2px_0_0_var(--brand)] pointer-events-none">
                    {exec.name}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
