"use client";

import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/ui/image-upload";
import { ImageFocus } from "@/components/ui/image-focus";
import {
  ExecRecord,
  ProfileRecord,
  WithKey,
  fetchProfile,
  stepDownAsCoPresident,
  updateProfile,
} from "@/lib/api";
import { ChevronDown } from "lucide-react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { TeamMemberCard } from "@/app/(public)/team/components/team-member-card";
import {
  SOCIAL_PLATFORMS,
  handleFromUrl,
  isValidHandle,
  urlFromHandle,
  type SocialKey,
} from "@/lib/execs/socials";
import { storedTerms } from "@/lib/execs/terms";
import { CO_PRESIDENT } from "@/lib/auth/capabilities";
import { useSession } from "../session";
import { TermsField } from "../users/terms-field";
import { Panel, Pill, fieldOn, labelClass, type PanelProps } from "../users/ui";
import { ask } from "../ask";
import { AdminPage } from "../page-frame";
import { MailForwarding } from "./forwarding";
import { SettingToggle } from "./setting-toggle";
import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { usePhone } from "@/lib/use-media-query";

type TeamMember = WithKey<ExecRecord>;

const ACCESS_CARD_PATTERN = /^\d{5}$/;

type Form = {
  description: string;
  terms: string[];
  hidden: boolean;
  photoUrl: string;
  photoPosition: string;
  handles: Record<SocialKey, string>;
  accessCardId: string;
};

const formFor = (exec: ProfileRecord | null): Form => ({
  description: exec?.description ?? "",
  terms: exec ? storedTerms(exec) : [],
  hidden: exec?.hidden ?? false,
  photoUrl: exec?.image?.url ?? "",
  photoPosition: exec?.image?.position ?? "50% 50%",
  handles: {
    github: handleFromUrl("github", exec?.socials?.github),
    linkedin: handleFromUrl("linkedin", exec?.socials?.linkedin),
    instagram: handleFromUrl("instagram", exec?.socials?.instagram),
    x: handleFromUrl("x", exec?.socials?.x),
  },
  accessCardId: exec?.accessCardId ?? "",
});

const field = fieldOn("bg-surface");

const Section = (props: PanelProps) => <Panel {...props} accent />;

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(formFor(null));
  const [saved, setSaved] = useState<Form>(formFor(null));
  const [steppingDown, setSteppingDown] = useState(false);
  const [stepDownNote, setStepDownNote] = useState<string | null>(null);
  const { user, refresh } = useSession();
  // D21: a filled destructive button only inside the confirmation on phones.
  const phone = usePhone();
  // Owners and bare approvers pass isApprover but have no co-president seat to give up.
  const isCoPresident = !!user?.roles?.includes(CO_PRESIDENT);
  const canStepDown = user?.identitiesEditable !== false;

  useEffect(() => {
    void (async () => {
      try {
        const exec = await fetchProfile();
        setProfile(exec);
        setForm(formFor(exec));
        setSaved(formFor(exec));
      } catch {
        setError("Couldn't load your profile. Refresh to try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const socials = useMemo(
    () =>
      Object.fromEntries(
        SOCIAL_PLATFORMS.map(({ key }) => [
          key,
          urlFromHandle(key, form.handles[key]),
        ]),
      ) as Record<SocialKey, string>,
    [form.handles],
  );

  const invalid = SOCIAL_PLATFORMS.filter(
    ({ key }) =>
      form.handles[key].trim() && !isValidHandle(key, form.handles[key].trim()),
  );
  const cardInvalid =
    form.accessCardId.trim() !== "" &&
    !ACCESS_CARD_PATTERN.test(form.accessCardId.trim());

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const blocked = invalid.length > 0 || cardInvalid;

  // Leaving with unsaved edits (reload, closing the tab) asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const discard = () => {
    setForm(saved);
    setError(null);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty || invalid.length || cardInvalid) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        description: form.description,
        // This page never refetches, so an unchanged list must not be resent.
        ...(form.terms.join(",") === saved.terms.join(",")
          ? {}
          : { terms: form.terms }),
        hidden: form.hidden,
        image: { url: form.photoUrl, position: form.photoPosition },
        socials,
        accessCardId: form.accessCardId.trim(),
      });
      setSaved(form);
    } catch (err) {
      setError(
        (err instanceof ApiError && err.detail) ||
          "Couldn't save. Try again in a moment.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminPage padY={10}>
        <div aria-busy="true" className="flex flex-col gap-6" role="status">
          <span className="sr-only">Loading your profile…</span>
          <span
            aria-hidden
            className="h-9 w-48 animate-pulse rounded bg-line/10"
          />
          {[0, 1, 2].map((row) => (
            <span
              aria-hidden
              className="h-32 animate-pulse rounded-[16px] border-2 border-line/30"
              key={row}
            />
          ))}
        </div>
      </AdminPage>
    );
  }

  if (!profile) {
    return (
      <AdminPage padY={10}>
        <h1 className="text-3xl font-extrabold text-ink">Your profile</h1>
        <p className="mt-3 max-w-prose text-subtle">
          {error ??
            "Your account isn't linked to a team page tile. Ask a co-president to link it — that happens when an account is approved."}
        </p>
        <div className="mt-8 max-w-[640px]">
          <MailForwarding />
        </div>
      </AdminPage>
    );
  }

  const problems = blocked ? (
    <>
      Fix{" "}
      {[
        ...invalid.map((p) => p.label),
        ...(cardInvalid ? ["the access card ID"] : []),
      ].join(" and ")}{" "}
      first.
    </>
  ) : null;

  const preview: TeamMember = {
    ...profile,
    description: form.description,
    socials,
    image: { url: form.photoUrl, position: form.photoPosition },
  };

  const hiddenCard = form.hidden ? "opacity-40 grayscale" : "";

  return (
    <AdminPage padY={10}>
      <h1 className="text-3xl font-extrabold text-ink">Your profile</h1>
      <p className="mt-2 text-subtle">
        Your card is public and the preview is exactly what visitors see. Email
        forwarding is private to you.
      </p>

      <form
        className={`mt-6 grid animate-fade-in gap-6 md:mt-9 md:grid-cols-[240px_1fr] md:items-start md:gap-8 ${
          dirty ? "phone:pb-28" : ""
        }`}
        id="profile-form"
        onSubmit={save}
      >
        {/* Below md: who you are in one row, and the card behind a
            disclosure instead of a full-screen preview up front. */}
        <details className="group overflow-hidden rounded-[16px] border-2 border-line bg-surface md:hidden">
          <summary className="press-flat flex cursor-pointer list-none items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
            <span
              className={`relative size-16 shrink-0 overflow-hidden rounded-[12px] border-2 border-line bg-raised ${hiddenCard}`}
            >
              {form.photoUrl ? (
                <Image
                  alt=""
                  className="object-cover"
                  fill
                  sizes="64px"
                  src={form.photoUrl}
                  style={{ objectPosition: form.photoPosition }}
                  unoptimized
                />
              ) : (
                <span className="flex h-full items-center justify-center text-2xl font-extrabold text-brand">
                  {profile.name?.trim().charAt(0).toUpperCase() ?? "?"}
                </span>
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
              <span className="max-w-full truncate text-lg leading-tight font-extrabold text-ink">
                {profile.name}
              </span>
              <span className="flex flex-wrap gap-1.5">
                {profile.title && <Pill>{profile.title}</Pill>}
                {form.hidden && <Pill tone="accent">Hidden</Pill>}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-subtle">
              Preview
              <ChevronDown
                aria-hidden
                className="size-5 transition-transform duration-[var(--dur)] group-open:rotate-180 motion-reduce:transition-none"
              />
            </span>
          </summary>
          <div className="border-t-2 border-line/15 p-3">
            <div className={hiddenCard}>
              <TeamMemberCard member={preview} />
            </div>
            <p className="mt-3 text-sm text-subtle">
              {form.hidden
                ? "You're hidden, so this card isn't on the team page right now."
                : "Exactly what visitors see on the team page."}{" "}
              Your name and role are set by a co-president.
            </p>
          </div>
        </details>

        <div className="hidden md:block desk:sticky desk:top-6">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wide text-subtle">
              Live preview
            </span>
            {form.hidden && (
              <span className="rounded-full border-2 border-line bg-tint px-2 py-0.5 text-[10px] font-extrabold uppercase text-ink">
                Hidden
              </span>
            )}
          </div>
          <div
            className={`transition-[opacity,filter] duration-[var(--dur)] ease-smooth ${
              form.hidden ? "opacity-40 grayscale" : ""
            }`}
          >
            <TeamMemberCard member={preview} />
          </div>
          {form.hidden && (
            <p className="mt-3 text-xs text-subtle">
              You&apos;re hidden, so this card isn&apos;t on the team page right
              now.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {/* Below md the summary row above says the same. */}
          <div className="max-md:hidden">
            <Section
              note="Only a co-president can change these."
              title="Identity"
            >
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="font-semibold text-subtle">Name</dt>
                <dd className="font-bold text-ink">{profile.name}</dd>
                <dt className="font-semibold text-subtle">Role</dt>
                <dd className="font-bold text-ink">{profile.title ?? "—"}</dd>
              </dl>
            </Section>
          </div>

          <Section title="Photo">
            <ImageUpload
              label=""
              onChange={(url) => {
                set("photoUrl", url);
                if (!url) set("photoPosition", "50% 50%");
              }}
              value={form.photoUrl}
            />
            {form.photoUrl && (
              <div className="mt-5 border-t-2 border-line pt-5">
                <ImageFocus
                  onChange={(position) => set("photoPosition", position)}
                  position={form.photoPosition}
                  url={form.photoUrl}
                />
              </div>
            )}
          </Section>

          <Section title="About you">
            <label className={labelClass} htmlFor="about">
              Short bio
            </label>
            <textarea
              className={`${field} min-h-[110px]`}
              id="about"
              maxLength={400}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What you work on, what you're into, what you'd help someone with."
              value={form.description}
            />
            <div className="mt-1 text-right text-xs text-subtle">
              {form.description.length}/400
            </div>

            <label className={`${labelClass} mt-3`} htmlFor="terms">
              Terms served
            </label>
            <TermsField
              fieldClass={field}
              id="terms"
              keepOne={profile.isCurrentExec === true}
              onChange={(terms) => set("terms", terms)}
              terms={form.terms}
            />
          </Section>

          <Section note="Enter your username, not the full link." title="Links">
            <div className="grid gap-4 sm:grid-cols-2">
              {SOCIAL_PLATFORMS.map(({ key, label: name, prefix, hint }) => {
                const value = form.handles[key];
                const bad = !!value.trim() && !isValidHandle(key, value.trim());
                return (
                  <div key={key}>
                    <label className={labelClass} htmlFor={key}>
                      {name}
                    </label>
                    <div
                      className={`flex items-center overflow-hidden rounded-[10px] border-2 bg-surface transition-colors duration-[var(--dur-fast)] ease-smooth ${
                        bad ? "border-destructive" : "border-line"
                      }`}
                    >
                      <span className="shrink-0 bg-raised px-2 py-2 text-sm text-subtle pointer-fine:text-xs">
                        {prefix}
                      </span>
                      <input
                        aria-invalid={bad}
                        autoCapitalize="none"
                        autoComplete="off"
                        autoCorrect="off"
                        className="w-full min-w-0 bg-transparent px-2 py-2 text-base text-ink outline-none pointer-fine:text-sm"
                        enterKeyHint="next"
                        id={key}
                        spellCheck={false}
                        onChange={(e) =>
                          set("handles", {
                            ...form.handles,
                            [key]: e.target.value,
                          })
                        }
                        placeholder="username"
                        value={value}
                      />
                    </div>
                    <p
                      className={`mt-1 text-sm pointer-fine:text-xs ${
                        bad ? "font-bold text-destructive" : "text-subtle"
                      }`}
                    >
                      {bad ? `Not a valid ${name} username. ${hint}` : hint}
                    </p>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section
            note="The 5-digit number printed on your physical access card."
            title="Access card"
          >
            <label className={labelClass} htmlFor="access-card">
              Card ID
            </label>
            <input
              aria-invalid={cardInvalid}
              className={`${field} max-w-[10rem]`}
              id="access-card"
              inputMode="numeric"
              maxLength={5}
              onChange={(e) =>
                set("accessCardId", e.target.value.replace(/\D/g, ""))
              }
              placeholder="e.g. 01234"
              value={form.accessCardId}
            />
            <p
              className={`mt-1 text-sm pointer-fine:text-xs ${
                cardInvalid ? "font-bold text-destructive" : "text-subtle"
              }`}
            >
              {cardInvalid
                ? "Must be exactly 5 digits."
                : "Leave blank if you don't have one yet."}
            </p>
          </Section>

          <Section title="Visibility">
            <SettingToggle
              applies="Saved with your profile"
              checked={form.hidden}
              detail="Your tile and login stay exactly as they are — the website just doesn't show you."
              onChange={(hidden) => set("hidden", hidden)}
              title="Hide me from the team page"
            />
          </Section>

          <MailForwarding />

          {/* Below md it sits after the save row, well away from Save. */}
          {isCoPresident && (
            <div className="max-md:order-last max-md:mt-2">
              <Section
                note="Approving sign-ups and managing the executive team."
                title="Co-president"
                tone="danger"
              >
                <p className="mb-4 max-w-prose text-sm text-ink">
                  Stepping down removes your approval rights immediately. There
                  must always be at least one co-president, so this is refused
                  if you are the last.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    disabled={steppingDown || !canStepDown}
                    onClick={async () => {
                      const confirmed = await ask({
                        title: "Step down as co-president?",
                        detail:
                          "Your approval rights end immediately and you lose your seat on admin@. Another co-president has to give the role back.",
                        confirmLabel: "Step down",
                        destructive: true,
                      });
                      if (confirmed === null) return;
                      setSteppingDown(true);
                      setStepDownNote(null);
                      try {
                        await stepDownAsCoPresident();
                        setStepDownNote("You are no longer a co-president.");
                        await refresh();
                      } catch (err) {
                        setStepDownNote(
                          err instanceof Error
                            ? err.message
                            : "Could not step down.",
                        );
                      } finally {
                        setSteppingDown(false);
                      }
                    }}
                    type="button"
                    variant={phone ? "outline-destructive" : "destructive"}
                  >
                    {steppingDown ? "Stepping down..." : "Step down"}
                  </Button>
                  {!canStepDown && (
                    <span className="text-sm font-bold text-subtle">
                      This environment shares the live Keycloak realm, so role
                      changes are only made from production.
                    </span>
                  )}
                  {stepDownNote && (
                    <span className="animate-rise-in text-sm font-bold text-destructive">
                      {stepDownNote}
                    </span>
                  )}
                </div>
              </Section>
            </div>
          )}

          {/* While dirty, phones use the pinned bar below instead. */}
          <div
            className={`flex min-h-[42px] flex-wrap items-center gap-3 ${
              dirty ? "phone:hidden" : ""
            }`}
          >
            {dirty ? (
              <>
                <Button
                  disabled={saving || blocked}
                  type="submit"
                  variant="primary"
                >
                  {saving ? "Saving..." : "Save changes"}
                </Button>
                <Button
                  disabled={saving}
                  onClick={discard}
                  type="button"
                  variant="secondary"
                >
                  Discard
                </Button>
                {problems && (
                  <span className="text-sm font-bold text-destructive">
                    {problems}
                  </span>
                )}
              </>
            ) : (
              <span className="flex animate-fade-in items-center gap-2 text-sm font-bold text-brand">
                <svg
                  aria-hidden
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M5 13l4 4L19 7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                All changes saved
              </span>
            )}
            {error && (
              <span className="text-sm font-bold text-destructive">
                {error}
              </span>
            )}
          </div>
        </div>
      </form>

      {/* Phones: Save and Discard pinned above the tab bar while there is
          something to save (dropping to the bottom edge while typing, when
          the tab bar hides). Portaled: <main> animates, which would trap a
          fixed bar in its stacking context. */}
      {dirty &&
        createPortal(
          <div className="chrome fixed inset-x-0 bottom-[var(--admin-bottom)] z-30 flex animate-rise-in flex-wrap items-center gap-x-3 gap-y-2 border-t-2 border-line bg-surface py-3 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] desk:hidden [html[data-typing]_&]:bottom-[env(safe-area-inset-bottom)]">
            {(problems || error) && (
              <p
                className="basis-full text-sm font-bold text-destructive"
                role="alert"
              >
                {problems ?? error}
              </p>
            )}
            <Button
              className="min-h-11"
              disabled={saving}
              onClick={discard}
              type="button"
              variant="secondary"
            >
              Discard
            </Button>
            <Button
              className="min-h-11 flex-1"
              disabled={saving || blocked}
              form="profile-form"
              type="submit"
              variant="primary"
            >
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>,
          document.body,
        )}
    </AdminPage>
  );
}
