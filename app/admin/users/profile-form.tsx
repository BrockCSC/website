"use client";

import { useEffect, useState } from "react";
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
import { servingTerm, storedTerms } from "@/lib/execs/terms";
import { ACTIVE_TITLES, isDeprecatedTitle } from "@/lib/execs/titles";
import { createTile, updateTile, type Exec } from "./api";
import { TermsField } from "./terms-field";
import { ApiError } from "@/lib/api/client";
import { Label, field } from "./ui";

export default function ProfileForm({
  exec,
  onSaved,
  onCancel,
  onDirtyChange,
  formId,
  onSavingChange,
}: {
  exec?: Exec;
  onSaved: (saved: Exec) => void;
  onCancel?: () => void;
  /** Unsaved edits, for the person screen's leave guard. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Set when a sheet's top bar submits the form: the in-form buttons hide on a phone. */
  formId?: string;
  onSavingChange?: (saving: boolean) => void;
}) {
  const [name, setName] = useState(exec?.name ?? "");
  const [title, setTitle] = useState(exec?.title ?? "Executive");
  const [description, setDescription] = useState(exec?.description ?? "");
  const stored = exec ? storedTerms(exec).join(",") : "";
  const [terms, setTerms] = useState<string[]>(() =>
    exec ? storedTerms(exec) : [servingTerm()],
  );
  // Returning someone to the team adds a term on the server, so follow the tile when it changes.
  const [tracked, setTracked] = useState(stored);
  if (exec && tracked !== stored) {
    setTracked(stored);
    setTerms(stored ? stored.split(",") : []);
  }
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

  const snapshot = JSON.stringify([
    name,
    title,
    description,
    terms,
    hidden,
    photo,
    handles,
  ]);
  // The first values, and again after a save (the tile comes back changed).
  const [clean, setClean] = useState(snapshot);
  const [cleanFor, setCleanFor] = useState(exec);
  if (exec !== cleanFor) {
    setCleanFor(exec);
    setClean(snapshot);
  }
  const dirty = snapshot !== clean;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => {
    onSavingChange?.(saving);
  }, [saving, onSavingChange]);

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
        hidden,
        socials,
        image: { url: photo, position: exec?.image?.position ?? "50% 50%" },
      };
      const changed = terms.join(",") !== stored;
      const saved = exec
        ? await updateTile(exec.$key, changed ? { ...body, terms } : body)
        : await createTile({ ...body, terms, isCurrentExec: true });
      // Only after success: a failed save must stay dirty so the leave guard holds.
      setClean(snapshot);
      onSaved(saved);
    } catch (err) {
      setError(
        (err instanceof ApiError && err.detail) ||
          "Could not save this profile. Try again in a moment.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="flex flex-col gap-4" id={formId} onSubmit={save}>
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
        <Label htmlFor="person-terms">Terms served</Label>
        <TermsField
          fieldClass={field}
          id="person-terms"
          keepOne={!exec || exec.isCurrentExec === true}
          onChange={setTerms}
          terms={terms}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {SOCIAL_PLATFORMS.map(({ key, label, prefix, hint }) => {
          const bad =
            !!handles[key].trim() && !isValidHandle(key, handles[key].trim());
          return (
            <div key={key}>
              <Label htmlFor={`person-${key}`}>{label}</Label>
              <div className="flex items-center overflow-hidden rounded-[10px] border-2 border-line bg-raised transition-colors duration-[var(--dur-fast)] ease-smooth focus-within:border-brand">
                <span className="shrink-0 px-2 py-2 text-sm text-subtle pointer-fine:text-xs">
                  {prefix}
                </span>
                <input
                  aria-invalid={bad}
                  autoCapitalize="none"
                  autoComplete="off"
                  autoCorrect="off"
                  className="w-full min-w-0 bg-transparent px-1 py-2 text-base text-ink outline-none pointer-fine:text-sm"
                  id={`person-${key}`}
                  onChange={(e) =>
                    setHandles({ ...handles, [key]: e.target.value })
                  }
                  placeholder="username"
                  spellCheck={false}
                  value={handles[key]}
                />
              </div>
              {bad && (
                <p className="mt-1 text-sm font-bold text-brand pointer-fine:text-xs">
                  {hint}
                </p>
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

      <div
        className={`flex flex-wrap items-center gap-3 ${formId ? "phone:hidden" : ""}`}
      >
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
      {formId && error && (
        <p className="text-sm font-bold text-brand desk:hidden" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
