"use client";

import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/ui/image-upload";
import { ImageFocus } from "@/components/ui/image-focus";
import {
  ExecRecord,
  WithKey,
  fetchProfile,
  stepDownAsCoPresident,
  updateProfile,
} from "@/lib/api";
import { TeamMemberCard } from "@/app/(public)/team/components/team-member-card";
import {
  SOCIAL_PLATFORMS,
  handleFromUrl,
  isValidHandle,
  urlFromHandle,
  type SocialKey,
} from "@/lib/execs/socials";
import { academicTerms } from "@/lib/execs/terms";
import { useSession } from "../session";
import { Panel, fieldOn, labelClass, type PanelProps } from "../users/ui";
import { ask } from "../ask";
import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api/client";

type TeamMember = WithKey<ExecRecord>;

type Form = {
  description: string;
  term: string;
  hidden: boolean;
  photoUrl: string;
  photoPosition: string;
  handles: Record<SocialKey, string>;
};

const formFor = (exec: TeamMember | null): Form => ({
  description: exec?.description ?? "",
  term: exec?.term ?? "",
  hidden: exec?.hidden ?? false,
  photoUrl: exec?.image?.url ?? "",
  photoPosition: exec?.image?.position ?? "50% 50%",
  handles: {
    github: handleFromUrl("github", exec?.socials?.github),
    linkedin: handleFromUrl("linkedin", exec?.socials?.linkedin),
    instagram: handleFromUrl("instagram", exec?.socials?.instagram),
    x: handleFromUrl("x", exec?.socials?.x),
  },
});

const page = "mx-auto w-full max-w-[1060px] px-5 py-10";
const field = fieldOn("bg-surface");

const Section = (props: PanelProps) => <Panel {...props} accent />;

export default function ProfilePage() {
  const [profile, setProfile] = useState<TeamMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(formFor(null));
  const [saved, setSaved] = useState<Form>(formFor(null));
  const [steppingDown, setSteppingDown] = useState(false);
  const [stepDownNote, setStepDownNote] = useState<string | null>(null);
  const { user, refresh } = useSession();
  const isApprover = !!user?.isApprover;
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

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty || invalid.length) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        description: form.description,
        term: form.term,
        hidden: form.hidden,
        image: { url: form.photoUrl, position: form.photoPosition },
        socials,
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
      <div className={page}>
        <p className="font-bold text-subtle">Loading your profile...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={page}>
        <h1 className="text-3xl font-extrabold text-ink">Your profile</h1>
        <p className="mt-3 max-w-prose text-subtle">
          {error ??
            "Your account isn't linked to a team page tile. Ask a co-president to link it — that happens when an account is approved."}
        </p>
      </div>
    );
  }

  const preview: TeamMember = {
    ...profile,
    description: form.description,
    term: form.term,
    socials,
    image: { url: form.photoUrl, position: form.photoPosition },
  };

  return (
    <div className={page}>
      <h1 className="text-3xl font-extrabold text-ink">Your profile</h1>
      <p className="mt-2 text-subtle">
        Everything here is public. The card is exactly what visitors see.
      </p>

      <form
        className="mt-9 grid animate-fade-in gap-6 lg:grid-cols-[320px_1fr] lg:items-start lg:gap-8"
        onSubmit={save}
      >
        <div className="lg:sticky lg:top-6">
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

            <label className={`${labelClass} mt-3`} htmlFor="term">
              Term
            </label>
            <select
              className={field}
              id="term"
              onChange={(e) => set("term", e.target.value)}
              value={form.term}
            >
              <option value="">Not set</option>
              {academicTerms().map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
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
                      <span className="shrink-0 bg-raised px-2 py-2 text-xs text-subtle">
                        {prefix}
                      </span>
                      <input
                        aria-invalid={bad}
                        className="w-full bg-transparent px-2 py-2 text-sm text-ink outline-none"
                        id={key}
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
                      className={`mt-1 text-xs ${
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

          <Section title="Visibility">
            <label className="flex items-start gap-3 text-sm">
              <input
                checked={form.hidden}
                className="check mt-0.5"
                onChange={(e) => set("hidden", e.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="font-bold text-ink">
                  Hide me from the team page
                </span>
                <span className="block text-subtle">
                  Your tile and login stay exactly as they are — the website
                  just doesn&apos;t show you.
                </span>
              </span>
            </label>
          </Section>

          {isApprover && (
            <Section
              note="Approving sign-ups and managing the executive team."
              title="Co-president"
              tone="danger"
            >
              <p className="mb-4 max-w-prose text-sm text-ink">
                Stepping down removes your approval rights immediately. There
                must always be at least one co-president, so this is refused if
                you are the last.
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
                  variant="destructive"
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
          )}

          <div className="flex min-h-[42px] flex-wrap items-center gap-3">
            {dirty ? (
              <>
                <Button
                  disabled={saving || invalid.length > 0}
                  type="submit"
                  variant="primary"
                >
                  {saving ? "Saving..." : "Save changes"}
                </Button>
                <Button
                  disabled={saving}
                  onClick={() => {
                    setForm(saved);
                    setError(null);
                  }}
                  type="button"
                  variant="secondary"
                >
                  Discard
                </Button>
                {invalid.length > 0 && (
                  <span className="text-sm font-bold text-destructive">
                    Fix {invalid.map((p) => p.label).join(" and ")} first.
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
    </div>
  );
}
