"use client";

import { useId, useState } from "react";
import Image from "next/image";
import { ChevronDown } from "lucide-react";

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

type DescriptionToggleProps = {
  description?: string;
  rowContent?: React.ReactNode;
  trigger: React.ReactNode;
};
const SOCIAL_ICON_SRC: Record<SocialLink["platform"], string> = {
  github: "/icons/github.svg",
  linkedin: "/icons/linkedin.svg",
  instagram: "/icons/instagram.svg",
  x: "/icons/x.svg",
};

function DescriptionToggle({
  description,
  rowContent,
  trigger,
}: DescriptionToggleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <button
          aria-controls={panelId}
          aria-expanded={isOpen}
          className="flex min-w-0 items-center gap-2 py-1 text-left text-brand"
          onClick={() => setIsOpen((prev) => !prev)}
          type="button"
        >
          {trigger}
          {description ? (
            <ChevronDown
              className={`size-4 shrink-0 transition-transform duration-[var(--dur)] ease-smooth ${isOpen ? "rotate-180" : ""}`}
            />
          ) : null}
        </button>
        {rowContent}
      </div>

      <div
        aria-hidden={!isOpen}
        className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-[var(--dur-slow)] ease-smooth ${
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
        id={panelId}
      >
        <div className="min-h-0">
          {description && (
            <p className="pt-2 text-sm leading-relaxed text-subtle">
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

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
  const imageUrl = member.image?.url;
  const name = member.name?.trim() || "Team Member";
  const title =
    member.title?.trim() || (isAlumni ? "Club Alumni" : "Executive Member");
  const explicitDescription = member.description?.trim();
  const socialLinks = getExecSocialLinks(member);
  const titleLabel = isAlumni ? (
    <p className="text-sm font-semibold text-brand">{title}</p>
  ) : (
    <Badge size="sm" variant="default">
      {title}
    </Badge>
  );
  const socialIconRow =
    socialLinks.length > 0 ? (
      <div className="flex items-center gap-1.5">
        {socialLinks.map((social) => (
          <a
            aria-label={`${name} ${social.platform}`}
            className="inline-flex size-9 items-center justify-center text-brand hover:opacity-75"
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
      </div>
    ) : null;

  const cardClass = isAlumni
    ? "overflow-hidden rounded-2xl border border-line/25 bg-raised"
    : "overflow-hidden rounded-[16px] border-2 border-brand bg-surface";
  const mediaClass = isAlumni
    ? "relative aspect-[4/3] border-b border-line/25 bg-raised"
    : "relative aspect-[4/3] bg-tint";

  return (
    <article className={cardClass}>
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
              height={64}
              src="/email-logo.png"
              width={64}
            />
          </div>
        )}
      </div>

      <div className={isAlumni ? "space-y-1 p-3" : "space-y-3 p-4"}>
        <div className="space-y-1">
          <h3
            className={
              isAlumni
                ? "text-lg font-semibold leading-tight text-ink/85"
                : "text-xl font-semibold leading-tight text-ink"
            }
          >
            {name}
          </h3>
          {explicitDescription ? (
            <DescriptionToggle
              description={explicitDescription}
              rowContent={socialIconRow}
              trigger={titleLabel}
            />
          ) : socialIconRow ? (
            <div className="flex items-center justify-between gap-2">
              {titleLabel}
              {socialIconRow}
            </div>
          ) : (
            titleLabel
          )}
        </div>
      </div>
    </article>
  );
}
