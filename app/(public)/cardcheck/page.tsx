import { TeamMemberCard } from "../team/components/team-member-card";
import type { ExecRecord, WithKey } from "@/lib/api";

const make = (n: number, over: Partial<ExecRecord>): WithKey<ExecRecord> =>
  ({
    $key: String(n),
    name: "Alaqmar Gandhi",
    title: "Executive",
    description: "",
    socials: {},
    ...over,
  }) as WithKey<ExecRecord>;

const people = [
  make(1, { title: "Executive" }),
  make(2, {
    title: "Vice President",
    socials: {
      github: "https://github.com/x",
      linkedin: "https://linkedin.com/in/x",
      instagram: "https://instagram.com/x",
    },
    description:
      "Hello, I'm Mehrbod Mehrabi (yes I know my first and last name look exactly the same but trust me, they're not). I'm in my second year of studying computer science. Gosh I love video games. I love playing them and I love making them. My favourite video game of all time is the Mass Effect series so you should play it if you haven't already. I also love running in the nature. As for programming, I am trying to get good at C++ and C# and anything that is fun because that is all there is. We're just here to have fun.",
  }),
  make(3, { title: "Co-President", description: "beep boop" }),
  make(4, {
    name: "Connor Bernard",
    title: "Treasurer",
    socials: {
      github: "https://github.com/x",
      linkedin: "https://linkedin.com/in/x",
    },
    description:
      "Come talk to me, or connect over LinkedIn.\n\nComputer Science Co-op, Year 4 @ BrockU\n\nDevOps Eng Co-op @ RBC, Game Dev @ Boltable Studio",
  }),
];

export default function CardCheck() {
  return (
    <main className="bg-surface py-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {people.map((p) => (
          <TeamMemberCard key={p.$key} member={p} />
        ))}
      </div>
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {people.map((p) => (
          <TeamMemberCard isAlumni key={p.$key} member={p} />
        ))}
      </div>
    </main>
  );
}
