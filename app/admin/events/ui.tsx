"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[10px] border-2 border-line px-4 py-2 text-sm font-bold transition disabled:pointer-events-none disabled:opacity-50";

export const btn = {
  primary: `${base} bg-brand text-brand-ink shadow-brut-sm hover:-translate-y-0.5`,
  secondary: `${base} bg-surface text-ink shadow-brut-sm hover:bg-tint`,
  danger: `${base} border-red-600 bg-red-600 text-surface shadow-brut-sm hover:-translate-y-0.5 dark:border-red-400 dark:bg-red-500`,
  quiet: `${base} border-transparent px-2.5 py-1.5 text-red-600 hover:bg-tint dark:text-red-400`,
};

export const field =
  "w-full rounded-[10px] border-2 border-line bg-surface px-3 py-2 text-sm font-medium text-ink outline-none [color-scheme:light] focus:bg-tint dark:[color-scheme:dark]";

export const errorText =
  "mt-1 text-xs font-bold text-red-600 dark:text-red-400";

export function Label({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor: string;
}) {
  return (
    <label className="mb-1 block text-sm font-bold text-ink" htmlFor={htmlFor}>
      {children}
    </label>
  );
}

/** Full-screen on a phone, a centred dialog from `sm` up. */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      aria-label={title}
      aria-modal="true"
      className="fixed inset-0 z-50 flex sm:items-center sm:justify-center sm:p-6"
      role="dialog"
    >
      <div className="absolute inset-0 bg-ink/40 dark:bg-surface/80" />
      <div className="relative flex h-full w-full flex-col bg-surface sm:h-auto sm:max-h-[86vh] sm:max-w-[660px] sm:rounded-[20px] sm:border-2 sm:border-line sm:shadow-brut">
        <div className="flex items-center gap-3 border-b-2 border-line px-5 py-4">
          <h2 className="text-lg font-extrabold text-ink">{title}</h2>
          <button
            aria-label="Close"
            className="ml-auto flex size-8 items-center justify-center rounded-[10px] border-2 border-line bg-surface text-lg font-bold text-ink hover:bg-tint"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PosterField({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed.");
      onChange(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div>
      <span className="mb-1 block text-sm font-bold text-ink">Poster</span>
      <div className="flex items-center gap-4">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-[10px] border-2 border-line bg-tint">
          {value ? (
            <Image
              alt=""
              className="object-cover"
              fill
              src={value}
              unoptimized
            />
          ) : (
            <span className="flex h-full items-center justify-center text-xs font-bold text-subtle">
              None
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
            ref={input}
            type="file"
          />
          <div className="flex gap-2">
            <button
              className={btn.secondary}
              disabled={uploading}
              onClick={() => input.current?.click()}
              type="button"
            >
              {uploading ? "Uploading..." : value ? "Replace" : "Upload"}
            </button>
            {value && (
              <button
                className={btn.quiet}
                disabled={uploading}
                onClick={() => onChange("")}
                type="button"
              >
                Remove
              </button>
            )}
          </div>
          <span className="text-xs text-subtle">
            JPEG, PNG, WebP, GIF or AVIF. Max 5MB.
          </span>
        </div>
      </div>
      {error && <p className={errorText}>{error}</p>}
    </div>
  );
}
