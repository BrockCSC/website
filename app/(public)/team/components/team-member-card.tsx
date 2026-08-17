"use client";

import { useId, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ExecRecord, WithKey } from "@/lib/api";

type TeamMemberCardProps = {
  member: WithKey<ExecRecord>;
  isAlumni?: boolean;
};

type SocialLink = {
  platform: "github" | "linkedin" | "instagram" | "x";
  url: string;
};

const SOCIAL_ICON_SRC: Record<SocialLink["platform"], string> = {
  github: "/icons/github.svg",
  linkedin: "/icons/linkedin.svg",
  instagram: "/icons/instagram.svg",
  x: "/icons/x.svg",
};

const normalizeSocialUrl = (rawValue?: string): string | null => {
  const input = rawValue?.trim();
  if (!input) {
    return null;
  }

  const candidate = /^https?:\/\//i.test(input) ? input : `https://${input}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
};

const getExecSocialLinks = (member: WithKey<ExecRecord>): SocialLink[] => {
  const socials = member.socials;
  const candidates: Array<[SocialLink["platform"], string | undefined]> = [
    ["github", socials?.github],
    ["linkedin", socials?.linkedin],
    ["instagram", socials?.instagram],
    ["x", socials?.x],
  ];

  return candidates.reduce<SocialLink[]>((links, [platform, rawUrl]) => {
    const normalizedUrl = normalizeSocialUrl(rawUrl);
    if (normalizedUrl) {
      links.push({ platform, url: normalizedUrl });
    }
    return links;
  }, []);
};

export function TeamMemberCard({
  member,
  isAlumni = false,
}: TeamMemberCardProps) {
  const [isBioOpen, setIsBioOpen] = useState(false);
  const bioPanelId = useId();

  const imageUrl = member.image?.url;
  const name = member.name?.trim() || "Team Member";
  const title =
    member.title?.trim() || (isAlumni ? "Club Alumni" : "Executive Member");
  const bio = member.description?.trim();
  const socialLinks = getExecSocialLinks(member);
  const titleLabel = isAlumni ? (
    <p className="max-w-full text-sm font-semibold text-brand">{title}</p>
  ) : (
    <Badge className="max-w-full overflow-hidden" size="sm" variant="default">
      {title}
    </Badge>
  );

  const cardClass = isAlumni
    ? "overflow-hidden rounded-2xl border border-line/25 bg-raised"
    : "overflow-hidden rounded-[16px] border-2 border-brand bg-surface";
  const mediaClass = isAlumni
    ? "relative aspect-[4/3] border-b border-line/25 bg-raised"
    : "relative aspect-[4/3] bg-tint";

  return (
    <article
      className={cardClass}
      onKeyDown={(keyEvent) => {
        if (keyEvent.key === "Escape") {
          setIsBioOpen(false);
        }
      }}
    >
      <div className={mediaClass}>
        {imageUrl ? (
          <Image
            alt={name}
            className="object-cover"
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1060px) 50vw, 25vw"
            src={imageUrl}
            style={{ objectPosition: member.image?.position ?? "50% 50%" }}
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Image
              alt=""
              className="size-16 rounded-full border-2 border-brand/35 opacity-90"
              height={256}
              src="/badger-256.png"
              width={256}
            />
          </div>
        )}

        {bio && (
          <div
            aria-hidden={!isBioOpen}
            className={`absolute inset-0 flex flex-col bg-surface/95 backdrop-blur-[2px] transition-[opacity,transform,visibility] duration-[var(--dur-slow)] ease-smooth ${
              isBioOpen
                ? "visible translate-y-0 opacity-100"
                : "invisible translate-y-4 opacity-0"
            }`}
            id={bioPanelId}
          >
            <div className="flex justify-end p-1.5 pb-0">
              <button
                aria-label={`Hide bio for ${name}`}
                className="grid size-7 place-items-center rounded-full border border-brand/35 bg-tint text-brand hover:bg-brand hover:text-brand-ink"
                onClick={() => setIsBioOpen(false)}
                type="button"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center-safe overflow-y-auto overscroll-contain px-3 pb-3">
              <p className="w-full whitespace-pre-line text-[0.82rem] leading-relaxed text-subtle">
                {bio}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className={isAlumni ? "space-y-1 p-3" : "space-y-3 p-4"}>
        <div className="space-y-1.5">
          <h3
            className={
              isAlumni
                ? "text-lg font-semibold leading-tight text-ink/85"
                : "text-xl font-semibold leading-tight text-ink"
            }
          >
            {name}
          </h3>

          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
            <div className="min-w-0">{titleLabel}</div>

            {(socialLinks.length > 0 || bio) && (
              <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1">
                {socialLinks.map((social) => (
                  <a
                    aria-label={`${name} ${social.platform}`}
                    className="inline-flex size-9 items-center justify-center rounded-full text-brand hover:bg-tint"
                    href={social.url}
                    key={social.platform}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <Image
                      alt=""
                      aria-hidden="true"
                      className="size-[18px] dark:brightness-[1.4]"
                      height={18}
                      src={SOCIAL_ICON_SRC[social.platform]}
                      width={18}
                    />
                  </a>
                ))}

                {bio && (
                  <button
                    aria-controls={bioPanelId}
                    aria-expanded={isBioOpen}
                    className={`inline-flex h-9 items-center rounded-full px-2.5 text-[0.65rem] font-bold uppercase tracking-wider ${
                      isBioOpen
                        ? "bg-brand text-brand-ink"
                        : "text-brand hover:bg-tint"
                    }`}
                    onClick={() => setIsBioOpen((previous) => !previous)}
                    type="button"
                  >
                    Bio
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
