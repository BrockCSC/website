"use client";

import { LoaderCircle, Plus } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { toUploadableImage } from "@/lib/image-file";
import { Button } from "./button";

// Touch: the thumbnail is itself the upload button, the buttons grow to 44px
// and Remove is a quiet text link. A fine pointer keeps the compact look.
const touchButton =
  "pointer-coarse:h-11 pointer-coarse:rounded-[16px] pointer-coarse:px-4 pointer-coarse:text-sm";

export function ImageUpload({
  value,
  onChange,
  label = "Photo",
}: {
  value?: string;
  onChange: (url: string) => void;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", await toUploadableImage(file));
      const res = await fetch("/api/uploads", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Upload failed.");
      }
      onChange(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };

  const pick = () => input.current?.click();
  const action = uploading ? "Uploading..." : value ? "Replace" : "Upload";
  const name = label || "photo";

  return (
    <div>
      <label className="mb-1 block text-sm font-bold">{label}</label>
      <div className="flex items-center gap-4">
        <button
          aria-busy={uploading || undefined}
          aria-label={
            uploading
              ? `Uploading ${name}`
              : value
                ? `Replace ${name}`
                : `Upload ${name}`
          }
          className="relative size-20 shrink-0 cursor-pointer overflow-hidden rounded-[12px] border-2 border-line bg-raised disabled:cursor-default pointer-coarse:active:opacity-80"
          disabled={uploading}
          onClick={pick}
          type="button"
        >
          {value ? (
            <Image
              alt=""
              className="object-cover"
              fill
              src={value}
              unoptimized
            />
          ) : (
            <span className="flex h-full items-center justify-center text-xs text-subtle">
              <span className="pointer-coarse:hidden">None</span>
              <Plus
                aria-hidden
                className="hidden size-7 pointer-coarse:block"
                strokeWidth={2.25}
              />
            </span>
          )}
          {uploading && (
            <span className="absolute inset-0 grid place-items-center bg-surface/70">
              <LoaderCircle
                aria-hidden
                className="size-6 animate-spin text-ink motion-reduce:animate-none"
              />
            </span>
          )}
        </button>

        <div className="flex min-w-0 flex-col gap-2">
          <input
            accept="image/*,.heic,.heif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
            ref={input}
            type="file"
          />
          <div className="flex flex-wrap items-center gap-2 pointer-coarse:gap-x-4">
            <Button
              className={touchButton}
              disabled={uploading}
              onClick={pick}
              size="xs"
              type="button"
              variant="secondary"
            >
              {action}
            </Button>
            {value && (
              <>
                <Button
                  className="pointer-coarse:hidden"
                  disabled={uploading}
                  onClick={() => onChange("")}
                  size="xs"
                  type="button"
                  variant="destructive"
                >
                  Remove
                </Button>
                <button
                  className="hidden min-h-11 items-center px-1 text-sm font-semibold text-destructive underline underline-offset-4 disabled:opacity-50 pointer-coarse:inline-flex"
                  disabled={uploading}
                  onClick={() => onChange("")}
                  type="button"
                >
                  Remove
                </button>
              </>
            )}
          </div>
          <span className="text-sm text-subtle pointer-fine:text-xs">
            Any photo. Large ones are resized before uploading.
          </span>
        </div>
      </div>
      {error && (
        <p className="mt-2 text-sm font-semibold text-destructive">{error}</p>
      )}
    </div>
  );
}
