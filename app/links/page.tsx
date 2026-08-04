import type { Metadata } from "next";
import type { ReactElement } from "react";
import Image from "next/image";
import { ArrowUpRight, School } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Links",
  description:
    "Quick access to BrockCSC's Discord, ExperienceBU, Instagram, and GitHub.",
};

type QuickLink =
  | {
      title: string;
      href: string;
      icon: string;
      iconAlt: string;
      featured?: boolean;
      badge?: string;
    }
  | {
      title: string;
      href: string;
      kind: "school";
      featured?: boolean;
      badge?: string;
    };

const quickLinks: QuickLink[] = [
  {
    title: "Join our Discord",
    href: "https://discord.gg/qsctEK2",
    icon: "/icons/discord.svg",
    iconAlt: "Discord icon",
    featured: true,
    badge: "Start here",
  },
  {
    title: "ExperienceBU Page",
    href: "https://experiencebu.brocku.ca/organization/brockcsc",
    kind: "school",
  },
  {
    title: "Follow us on Instagram",
    href: "https://instagram.com/brockcsc",
    icon: "/icons/instagram.svg",
    iconAlt: "Instagram icon",
  },
  {
    title: "Check our GitHub",
    href: "https://github.com/brockcsc",
    icon: "/icons/github.svg",
    iconAlt: "GitHub icon",
  },
  {
    title: "Connect on LinkedIn",
    href: "https://www.linkedin.com/company/brockcsc",
    icon: "/icons/linkedin.svg",
    iconAlt: "LinkedIn icon",
  },
];

function LinkIcon({ link }: { link: QuickLink }): ReactElement {
  if ("kind" in link) {
    return <School className="size-7 text-primary" aria-hidden="true" />;
  }

  return (
    <Image
      src={link.icon}
      alt={link.iconAlt}
      width={36}
      height={36}
      className="size-9 object-contain"
    />
  );
}

export default function LinksPage(): ReactElement {
  return (
    <main className="bg-white pb-10">
      <section className="border-b border-border pt-4 pb-4">
        <h1 className="m-0 text-[clamp(2.1rem,3.5vw,2.9rem)] font-semibold leading-[1.05]">
          Links
        </h1>
        <p className="section-lead mt-2 max-w-[580px] pl-3 text-[0.92rem]">
          Find Brock CSC across the platforms that matter most, from our Discord
          community to campus updates and social channels.
        </p>
      </section>

      <div className="mx-auto flex w-full max-w-136 flex-col gap-3 pt-6 sm:gap-4 sm:pt-8 md:pt-10">
        {quickLinks.map((link) => (
          <Button
            key={link.href}
            asChild
            variant="outline"
            className={cn(
              "h-auto w-full justify-start rounded-[20px] bg-white px-0 py-0 text-left shadow-[4px_4px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-[#fff7f6] hover:shadow-[2px_2px_0_0_#000] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none",
              link.featured &&
                "bg-[#fff3f2] shadow-[4px_4px_0_0_#9A4440] hover:bg-[#ffefed] hover:shadow-[2px_2px_0_0_#9A4440]",
            )}
          >
            <a href={link.href} target="_blank" rel="noopener noreferrer">
              <span className="grid min-h-18 w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-3.5 py-3 sm:min-h-20 sm:gap-4 sm:px-4 sm:py-4">
                <span className="flex size-9 shrink-0 items-center justify-center sm:size-10">
                  <LinkIcon link={link} />
                </span>

                <span className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 text-base font-black leading-tight text-foreground sm:text-[1.12rem]">
                    {link.title}
                  </span>
                  {link.badge ? (
                    <span className="shrink-0 rounded-full border border-primary/30 bg-white px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-primary">
                      {link.badge}
                    </span>
                  ) : null}
                </span>

                <ArrowUpRight
                  className="size-5 shrink-0 text-primary sm:size-6"
                  aria-hidden="true"
                />
              </span>
            </a>
          </Button>
        ))}
      </div>
    </main>
  );
}
