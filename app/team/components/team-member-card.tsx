"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { ChevronDown, UserRound } from "lucide-react";

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
  const [contentHeight, setContentHeight] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!contentRef.current) {
      return;
    }

    setContentHeight(contentRef.current.scrollHeight);
  }, [description, isOpen]);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <button
          aria-controls={panelId}
          aria-expanded={isOpen}
          className="flex min-w-0 items-center gap-2 text-left text-[#9A4440]"
          onClick={() => setIsOpen((prev) => !prev)}
          type="button"
        >
          {trigger}
          {description ? (
            <ChevronDown
              className={`size-4 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            />
          ) : null}
        </button>
        {rowContent}
      </div>

      <div
        aria-hidden={!isOpen}
        className="overflow-hidden transition-[max-height,opacity,margin] duration-300 ease-out"
        id={panelId}
        style={{
          marginTop: description && isOpen ? "0.5rem" : "0rem",
          maxHeight: isOpen ? `${contentHeight}px` : "0px",
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div ref={contentRef}>
          {description && (
            <p className="text-sm leading-relaxed text-muted-foreground">
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
    <p className="text-sm font-semibold text-[#9A4440]">{title}</p>
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
            className="inline-flex h-5 w-5 items-center justify-center text-[#9A4440] transition-opacity hover:opacity-75"
            href={social.url}
            key={social.platform}
            rel="noopener noreferrer"
            target="_blank"
          >
            <Image
              alt=""
              aria-hidden="true"
              className="size-[18px]"
              height={18}
              src={SOCIAL_ICON_SRC[social.platform]}
              width={18}
            />
          </a>
        ))}
      </div>
    ) : null;

  const cardClass = isAlumni
    ? "overflow-hidden rounded-2xl border border-border bg-card"
    : "overflow-hidden rounded-[16px] border-2 border-primary bg-white";
  const mediaClass = isAlumni
    ? "relative aspect-[4/3] border-b border-border bg-muted"
    : "relative aspect-[4/3] bg-[#f7ecec]";

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
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="flex size-16 items-center justify-center rounded-full border-2 border-[#9A4440]/35 bg-white/80">
              <UserRound className="size-8 text-[#9A4440]" strokeWidth={2.25} />
            </div>
          </div>
        )}
      </div>

      <div className={isAlumni ? "space-y-1 p-3" : "space-y-3 p-4"}>
        <div className="space-y-1">
          <h3
            className={
              isAlumni
                ? "text-lg font-semibold leading-tight text-foreground/85"
                : "text-xl font-semibold leading-tight text-foreground"
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
