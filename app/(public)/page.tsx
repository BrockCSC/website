import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DiscordButton } from "@/components/ui/discord-button";
import { PhotoFrame } from "@/components/ui/photo-frame";
import { MemberBadge } from "@/components/ui/member-badge";
import { UpcomingEventsSection } from "@/components/sections/upcoming-events";
import { AboutUsSection } from "@/components/sections/about-us";

export default function Home() {
  return (
    <div className="flex flex-col w-full font-sans bg-white overflow-x-hidden">
      <section className="relative w-full border-b-2 border-black">
        <div className="max-w-7xl mx-auto px-8 py-24 md:py-32 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="flex flex-col items-start gap-6 z-10">
            <Badge
              variant="outline"
              className="text-[#9A4440] border-[#9A4440] bg-[#fff1f1] px-4 py-1.5 uppercase font-bold tracking-wider rounded-full shadow-[2px_2px_0_0_#9A4440]"
            >
              WELCOME TO THE CLUB
            </Badge>

            <h1 className="text-5xl sm:text-6xl md:text-7xl font-black leading-[1.1] tracking-tight">
              Brock
              <br />
              <span className="text-[#9A4440] underline decoration-[#9A4440] decoration-[6px] underline-offset-[10px]">
                Computer
              </span>
              <br />
              Science Club
            </h1>

            <p className="text-lg md:text-xl text-neutral-600 max-w-md border-l-4 border-[#9A4440] pl-4 mt-2 font-medium">
              Aiming to foster a community for individuals at Brock University
              interested in Computer Science. Code, connect, and create with us.
            </p>

            <div className="flex flex-wrap items-center gap-4 mt-4">
              <DiscordButton className="w-auto" />
              <Button asChild size="lg" variant="outline" className="bg-white">
                <Link href="#about">Learn More</Link>
              </Button>
            </div>
          </div>

          <div className="relative w-full aspect-square md:aspect-[4/3] max-w-lg mx-auto lg:ml-auto">
            <PhotoFrame
              src="./hero_image.jpg"
              alt="Group picture of people from the Computer Science Club"
              className="w-full h-full"
            />
            <MemberBadge
              count="900+"
              className="absolute -bottom-6 -right-2 md:-right-8 z-20"
            />
          </div>
        </div>
      </section>

      <UpcomingEventsSection />
      <AboutUsSection />
    </div>
  );
}
