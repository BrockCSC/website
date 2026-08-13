"use client";

import { Button } from "@/components/ui/button";
import { ExecRecord, WithKey, fetchProfile, updateProfile } from "@/lib/api";
import { useEffect, useState } from "react";

type TeamMember = WithKey<ExecRecord>;

export default function ProfilePage() {
  const [profile, setProfile] = useState<TeamMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState("");
  const [term, setTerm] = useState("");
  const [hidden, setHidden] = useState(false);
  const [github, setGithub] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [instagram, setInstagram] = useState("");
  const [twitter, setTwitter] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const exec = await fetchProfile();
        setProfile(exec);
        setDescription(exec?.description ?? "");
        setTerm(exec?.term ?? "");
        setHidden(exec?.hidden ?? false);
        setGithub(exec?.socials?.github ?? "");
        setLinkedin(exec?.socials?.linkedin ?? "");
        setInstagram(exec?.socials?.instagram ?? "");
        setTwitter(exec?.socials?.x ?? "");
        setPhotoUrl(exec?.image?.url ?? "");
      } catch {
        setStatus("Couldn't load your profile. Please try again in a moment.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatus(null);
    try {
      await updateProfile({
        description,
        term,
        hidden,
        image: { url: photoUrl },
        socials: { github, linkedin, instagram, x: twitter },
      });
      setStatus("Profile saved.");
    } catch {
      setStatus("Couldn't save your profile. Please try again in a moment.");
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <p className="text-neutral-500">Loading your profile...</p>;
  }

  if (!profile) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">My Profile</h1>
        <p className="text-neutral-500">
          Your account isn&apos;t linked to a team page tile. Ask a co-president
          to sort it out — tiles are linked when an account is approved.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">My Profile</h1>
      <p className="text-neutral-500 mb-6">
        Update how you appear on the team page.
      </p>
      <form onSubmit={handleSubmit} className="max-w-md">
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">Full Name</label>
          <p className="font-semibold">{profile.name}</p>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">Role</label>
          <p className="font-semibold">{profile.title}</p>
          <p className="text-xs text-neutral-500 mt-1">
            Your name and role can only be changed by a co-president.
          </p>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">
            Description
          </label>
          <textarea
            className="w-full rounded border px-3 py-2"
            placeholder="A short bio..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">
            Term (e.g. 2016-2017)
          </label>
          <input
            type="text"
            className="w-full rounded border px-3 py-2"
            placeholder="2016-2017"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>

        <label className="my-6 flex items-start gap-2 text-sm">
          <input
            checked={hidden}
            className="mt-1"
            onChange={(e) => setHidden(e.target.checked)}
            type="checkbox"
          />
          <span>
            Hide me from the public team page
            <span className="block text-neutral-500">
              Your tile stays in the admin panel and your login keeps working —
              it just isn&apos;t shown on the website.
            </span>
          </span>
        </label>
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">Github URL</label>
          <input
            type="text"
            className="w-full rounded border px-3 py-2"
            placeholder="https://github.com/username"
            value={github}
            onChange={(e) => setGithub(e.target.value)}
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">LinkedIn</label>
          <input
            type="url"
            className="w-full rounded border px-3 py-2"
            placeholder="https://www.linkedin.com/in/username"
            value={linkedin}
            onChange={(e) => setLinkedin(e.target.value)}
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">Instagram</label>
          <input
            type="url"
            className="w-full rounded border px-3 py-2"
            placeholder="https://www.instagram.com/username"
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">X URL</label>
          <input
            type="url"
            className="w-full rounded border px-3 py-2"
            placeholder="https://twitter.com/username"
            value={twitter}
            onChange={(e) => setTwitter(e.target.value)}
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">
            Profile Photo URL
          </label>
          <input
            type="url"
            className="w-full rounded border px-3 py-2"
            placeholder="https://example.com/photo.png"
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
          />
        </div>
        {status && <p className="mb-4 text-sm font-semibold">{status}</p>}
        <Button variant="primary" type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Profile"}
        </Button>
      </form>
    </div>
  );
}
