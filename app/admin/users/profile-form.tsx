"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/ui/image-upload";
import type { ExecSocialLinks } from "@/lib/api/types";
import {
  SOCIAL_PLATFORMS,
  handleFromUrl,
  isValidHandle,
  urlFromHandle,
  type SocialKey,
} from "@/lib/execs/socials";
import { academicTerms } from "@/lib/execs/terms";
import { ACTIVE_TITLES, isDeprecatedTitle } from "@/lib/execs/titles";
import { createTile, updateTile, type Exec } from "./api";
import { Label, field } from "./ui";

export default function ProfileForm({
  exec,
  onSaved,
  onCancel,
}: {
  exec?: Exec;
  onSaved: (saved: Exec) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(exec?.name ?? "");
  const [title, setTitle] = useState(exec?.title ?? "Executive");
  const [description, setDescription] = useState(exec?.description ?? "");
  const [term, setTerm] = useState(exec?.term ?? "");
  const [hidden, setHidden] = useState(exec?.hidden ?? false);
  const [photo, setPhoto] = useState(exec?.image?.url ?? "");
  const [handles, setHandles] = useState<Record<SocialKey, string>>({
    github: handleFromUrl("github", exec?.socials?.github),
    linkedin: handleFromUrl("linkedin", exec?.socials?.linkedin),
    instagram: handleFromUrl("instagram", exec?.socials?.instagram),
    x: handleFromUrl("x", exec?.socials?.x),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalid = SOCIAL_PLATFORMS.filter(
    ({ key }) =>
      handles[key].trim() && !isValidHandle(key, handles[key].trim()),
  );

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid.length) return;
    setSaving(true);
    setError(null);
    try {
      const socials = Object.fromEntries(
        SOCIAL_PLATFORMS.map(({ key }) => [
          key,
          urlFromHandle(key, handles[key]),
        ]),
      ) as ExecSocialLinks;
      const body = {
        name: name.trim(),
        title,
        description,
        term,
        hidden,
        socials,
        image: { url: photo, position: exec?.image?.position ?? "50% 50%" },
      };
      onSaved(
        exec
          ? await updateTile(exec.$key, body)
          : await createTile({ ...body, isCurrentExec: true }),
      );
    } catch {
      setError("Could not save this profile. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={save}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="person-name">Full name</Label>
          <input
            className={field}
            id="person-name"
            onChange={(e) => setName(e.target.value)}
            required
            value={name}
          />
        </div>
        <div>
          <Label htmlFor="person-title">Role</Label>
          <select
            className={field}
            id="person-title"
            onChange={(e) => setTitle(e.target.value)}
            value={title}
          >
            {ACTIVE_TITLES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            {isDeprecatedTitle(title) && (
              <option value={title}>{title} (retired)</option>
            )}
          </select>
        </div>
      </div>

      <div>
        <Label htmlFor="person-bio">Short bio</Label>
        <textarea
          className={`${field} min-h-[90px]`}
          id="person-bio"
          maxLength={400}
          onChange={(e) => setDescription(e.target.value)}
          value={description}
        />
      </div>

      <div>
        <Label htmlFor="person-term">Term</Label>
        <select
          className={field}
          id="person-term"
          onChange={(e) => setTerm(e.target.value)}
          value={term}
        >
          <option value="">Not set</option>
          {academicTerms().map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {SOCIAL_PLATFORMS.map(({ key, label, prefix, hint }) => {
          const bad =
            !!handles[key].trim() && !isValidHandle(key, handles[key].trim());
          return (
            <div key={key}>
              <Label htmlFor={`person-${key}`}>{label}</Label>
              <div className="flex items-center overflow-hidden rounded-[10px] border-2 border-line bg-raised transition-colors duration-[var(--dur-fast)] ease-smooth focus-within:border-brand">
                <span className="shrink-0 px-2 py-2 text-xs text-subtle">
                  {prefix}
                </span>
                <input
                  aria-invalid={bad}
                  className="w-full bg-transparent px-1 py-2 text-sm text-ink outline-none"
                  id={`person-${key}`}
                  onChange={(e) =>
                    setHandles({ ...handles, [key]: e.target.value })
                  }
                  placeholder="username"
                  value={handles[key]}
                />
              </div>
              {bad && (
                <p className="mt-1 text-xs font-bold text-brand">{hint}</p>
              )}
            </div>
          );
        })}
      </div>

      <ImageUpload label="Photo" onChange={setPhoto} value={photo} />

      <label className="flex items-start gap-3 text-sm text-ink">
        <input
          checked={hidden}
          className="check mt-0.5"
          onChange={(e) => setHidden(e.target.checked)}
          type="checkbox"
        />
        <span>
          <span className="font-bold">Hide from the team page</span>
          <span className="block text-subtle">
            The tile and their login stay as they are; the website just
            doesn&apos;t show them.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={saving || invalid.length > 0}
          size="sm"
          type="submit"
          variant="primary"
        >
          {saving ? "Saving..." : exec ? "Save profile" : "Create profile"}
        </Button>
        {onCancel && (
          <Button
            disabled={saving}
            onClick={onCancel}
            size="sm"
            type="button"
            variant="secondary"
          >
            Cancel
          </Button>
        )}
        {error && <span className="text-sm font-bold text-brand">{error}</span>}
      </div>
    </form>
  );
}
