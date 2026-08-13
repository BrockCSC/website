"use client";

import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/ui/image-upload";
import { ImageFocus } from "@/components/ui/image-focus";
import { ExecRecord, WithKey, fetchProfile, updateProfile } from "@/lib/api";
import { TeamMemberCard } from "@/app/team/components/team-member-card";
import {
  SOCIAL_PLATFORMS,
  handleFromUrl,
  isValidHandle,
  urlFromHandle,
  type SocialKey,
} from "@/lib/execs/socials";
import { academicTerms } from "@/lib/execs/terms";
import { useEffect, useMemo, useState } from "react";

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

const field = "w-full rounded-[10px] border-2 border-black px-3 py-2 text-sm";

const Section = ({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) => (
  <section className="rounded-2xl border-2 border-black bg-white p-5 shadow-[4px_4px_0px_#9A4440]">
    <h2 className="text-sm font-bold uppercase tracking-wide">{title}</h2>
    {note && <p className="mt-1 text-sm text-neutral-500">{note}</p>}
    <div className="mt-4">{children}</div>
  </section>
);

export default function ProfilePage() {
  const [profile, setProfile] = useState<TeamMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(formFor(null));
  const [saved, setSaved] = useState<Form>(formFor(null));

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
    } catch {
      setError("Couldn't save. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-neutral-500">Loading your profile...</p>;
  }

  if (!profile) {
    return (
      <div>
        <h1 className="mb-2 text-2xl font-bold">My Profile</h1>
        <p className="text-neutral-500">
          Your account isn&apos;t linked to a team page tile. Ask a co-president
          to link it — that happens when an account is approved.
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
    <div>
      <h1 className="mb-1 text-2xl font-bold">My Profile</h1>
      <p className="mb-8 text-neutral-500">
        Everything here is public. The card on the left is exactly what visitors
        see.
      </p>

      <form
        className="grid gap-8 lg:grid-cols-[320px_1fr] lg:items-start"
        onSubmit={save}
      >
        <div className="lg:sticky lg:top-6">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide">
              Live preview
            </span>
            {form.hidden && (
              <span className="rounded-full border-2 border-black bg-neutral-200 px-2 py-0.5 text-[10px] font-bold uppercase">
                Hidden
              </span>
            )}
          </div>
          <div className={form.hidden ? "opacity-40 grayscale" : undefined}>
            <TeamMemberCard member={preview} />
          </div>
          {form.hidden && (
            <p className="mt-3 text-xs text-neutral-500">
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
              <dt className="font-semibold text-neutral-500">Name</dt>
              <dd className="font-bold">{profile.name}</dd>
              <dt className="font-semibold text-neutral-500">Role</dt>
              <dd className="font-bold">{profile.title ?? "—"}</dd>
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
              <div className="mt-5 border-t-2 border-neutral-200 pt-5">
                <ImageFocus
                  onChange={(position) => set("photoPosition", position)}
                  position={form.photoPosition}
                  url={form.photoUrl}
                />
              </div>
            )}
          </Section>

          <Section title="About you">
            <label className="mb-1 block text-sm font-semibold" htmlFor="about">
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
            <div className="mt-1 text-right text-xs text-neutral-400">
              {form.description.length}/400
            </div>

            <label
              className="mb-1 mt-3 block text-sm font-semibold"
              htmlFor="term"
            >
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
              {SOCIAL_PLATFORMS.map(({ key, label, prefix, hint }) => {
                const value = form.handles[key];
                const bad = !!value.trim() && !isValidHandle(key, value.trim());
                return (
                  <div key={key}>
                    <label
                      className="mb-1 block text-sm font-semibold"
                      htmlFor={key}
                    >
                      {label}
                    </label>
                    <div
                      className={`flex items-center overflow-hidden rounded-[10px] border-2 ${
                        bad ? "border-[#d44b4b]" : "border-black"
                      }`}
                    >
                      <span className="shrink-0 bg-neutral-100 px-2 py-2 text-xs text-neutral-500">
                        {prefix}
                      </span>
                      <input
                        aria-invalid={bad}
                        className="w-full px-2 py-2 text-sm outline-none"
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
                        bad
                          ? "font-semibold text-[#d44b4b]"
                          : "text-neutral-500"
                      }`}
                    >
                      {bad ? `Not a valid ${label} username. ${hint}` : hint}
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
                className="mt-1 size-4"
                onChange={(e) => set("hidden", e.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="font-semibold">
                  Hide me from the team page
                </span>
                <span className="block text-neutral-500">
                  Your tile and login stay exactly as they are — the website
                  just doesn&apos;t show you.
                </span>
              </span>
            </label>
          </Section>

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
                  <span className="text-sm font-semibold text-[#d44b4b]">
                    Fix {invalid.map((p) => p.label).join(" and ")} first.
                  </span>
                )}
              </>
            ) : (
              <span className="flex items-center gap-2 text-sm font-semibold text-green-700">
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
              <span className="text-sm font-semibold text-[#d44b4b]">
                {error}
              </span>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
