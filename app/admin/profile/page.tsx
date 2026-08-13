"use client";

import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/ui/image-upload";
import { ExecRecord, WithKey, fetchProfile, updateProfile } from "@/lib/api";
import { TeamMemberCard } from "@/app/team/components/team-member-card";
import { useEffect, useState } from "react";

type TeamMember = WithKey<ExecRecord>;

const SOCIALS = [
  { key: "github", label: "GitHub", hint: "github.com/username" },
  { key: "linkedin", label: "LinkedIn", hint: "linkedin.com/in/username" },
  { key: "instagram", label: "Instagram", hint: "instagram.com/username" },
  { key: "x", label: "X", hint: "x.com/username" },
] as const;

type SocialKey = (typeof SOCIALS)[number]["key"];

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
  const [status, setStatus] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [term, setTerm] = useState("");
  const [hidden, setHidden] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const [socials, setSocials] = useState<Record<SocialKey, string>>({
    github: "",
    linkedin: "",
    instagram: "",
    x: "",
  });

  useEffect(() => {
    void (async () => {
      try {
        const exec = await fetchProfile();
        setProfile(exec);
        setDescription(exec?.description ?? "");
        setTerm(exec?.term ?? "");
        setHidden(exec?.hidden ?? false);
        setPhotoUrl(exec?.image?.url ?? "");
        setSocials({
          github: exec?.socials?.github ?? "",
          linkedin: exec?.socials?.linkedin ?? "",
          instagram: exec?.socials?.instagram ?? "",
          x: exec?.socials?.x ?? "",
        });
      } catch {
        setStatus("Couldn't load your profile. Refresh to try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      await updateProfile({
        description,
        term,
        hidden,
        image: { url: photoUrl },
        socials,
      });
      setStatus("Saved.");
    } catch {
      setStatus("Couldn't save. Try again in a moment.");
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
    description,
    term,
    socials,
    image: { url: photoUrl },
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
            {hidden && (
              <span className="rounded-full border-2 border-black bg-neutral-200 px-2 py-0.5 text-[10px] font-bold uppercase">
                Hidden
              </span>
            )}
          </div>
          <div className={hidden ? "opacity-40 grayscale" : undefined}>
            <TeamMemberCard member={preview} />
          </div>
          {hidden && (
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
            <ImageUpload label="" onChange={setPhotoUrl} value={photoUrl} />
          </Section>

          <Section title="About you">
            <label className="mb-1 block text-sm font-semibold" htmlFor="about">
              Short bio
            </label>
            <textarea
              className={`${field} min-h-[110px]`}
              id="about"
              maxLength={400}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What you work on, what you're into, what you'd help someone with."
              value={description}
            />
            <div className="mt-1 text-right text-xs text-neutral-400">
              {description.length}/400
            </div>

            <label
              className="mb-1 mt-3 block text-sm font-semibold"
              htmlFor="term"
            >
              Term
            </label>
            <input
              className={field}
              id="term"
              onChange={(e) => setTerm(e.target.value)}
              placeholder="2025-2026"
              value={term}
            />
          </Section>

          <Section
            note="Leave blank to hide an icon on your card."
            title="Links"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {SOCIALS.map(({ key, label, hint }) => (
                <div key={key}>
                  <label
                    className="mb-1 block text-sm font-semibold"
                    htmlFor={key}
                  >
                    {label}
                  </label>
                  <input
                    className={field}
                    id={key}
                    onChange={(e) =>
                      setSocials((s) => ({ ...s, [key]: e.target.value }))
                    }
                    placeholder={hint}
                    value={socials[key]}
                  />
                </div>
              ))}
            </div>
          </Section>

          <Section title="Visibility">
            <label className="flex items-start gap-3 text-sm">
              <input
                checked={hidden}
                className="mt-1 size-4"
                onChange={(e) => setHidden(e.target.checked)}
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

          <div className="flex items-center gap-4">
            <Button disabled={saving} type="submit" variant="primary">
              {saving ? "Saving..." : "Save changes"}
            </Button>
            {status && (
              <span
                className={`text-sm font-semibold ${
                  status === "Saved." ? "text-neutral-600" : "text-[#d44b4b]"
                }`}
              >
                {status}
              </span>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
