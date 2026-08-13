"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { Button } from "./button";

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
      body.append("file", file);
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

  return (
    <div>
      <label className="mb-1 block text-sm font-bold">{label}</label>
      <div className="flex items-center gap-4">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-[12px] border-2 border-black bg-neutral-100">
          {value ? (
            <Image
              alt=""
              className="object-cover"
              fill
              src={value}
              unoptimized
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-neutral-400">
              None
            </div>
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
            <Button
              disabled={uploading}
              onClick={() => input.current?.click()}
              size="xs"
              type="button"
              variant="secondary"
            >
              {uploading ? "Uploading..." : value ? "Replace" : "Upload"}
            </Button>
            {value && (
              <Button
                disabled={uploading}
                onClick={() => onChange("")}
                size="xs"
                type="button"
                variant="destructive"
              >
                Remove
              </Button>
            )}
          </div>
          <span className="text-xs text-neutral-500">
            JPEG, PNG, WebP, GIF or AVIF. Max 5MB.
          </span>
        </div>
      </div>
      {error && (
        <p className="mt-2 text-sm font-semibold text-[#d44b4b]">{error}</p>
      )}
    </div>
  );
}
