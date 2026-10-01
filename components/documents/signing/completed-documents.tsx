"use client";

import { Download, Share } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { PHONE_QUERY, mediaMatches } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { DocumentPages } from "./document-pages";

type Which = "signed" | "certificate" | "combined";

const SHORT: Record<Which, string> = {
  signed: "Signed",
  certificate: "Certificate",
  combined: "Both",
};

/** True where the Web Share API takes files (most phones). */
const canShareFiles = () => {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  try {
    return navigator.canShare({
      files: [new File([""], "probe.pdf", { type: "application/pdf" })],
    });
  } catch {
    return false;
  }
};

/**
 * Phones that can share files: the current file, fetched ahead of the tap
 * (navigator.share needs the tap's user activation, which an await would
 * spend). Null until it's ready, or where sharing isn't available.
 */
const useShareableFile = (url: string, name: string) => {
  const [file, setFile] = useState<{ url: string; file: File } | null>(null);
  useEffect(() => {
    if (!mediaMatches(PHONE_QUERY) || !canShareFiles()) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) return;
        const blob = await res.blob();
        const type = blob.type || "application/pdf";
        const ext = type === "application/pdf" ? ".pdf" : "";
        const shared = new File([blob], `${name}${ext}`, { type });
        if (!cancelled && navigator.canShare?.({ files: [shared] })) {
          setFile({ url, file: shared });
        }
      } catch {
        // Download still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, name]);
  return file?.url === url ? file.file : null;
};

/** The stamped PDF and its Certificate of Completion, one at a time, read-only. */
export function CompletedDocuments({
  signedFileUrl,
  certificateUrl,
  combinedUrl,
  bleed = false,
}: {
  signedFileUrl: string;
  certificateUrl: string;
  combinedUrl?: string;
  /** Public pages: below sm the pages run edge to edge over the 1.25rem gutter. */
  bleed?: boolean;
}) {
  const baseId = useId();
  const [which, setWhich] = useState<Which>("signed");
  const urls: Record<Which, string> = {
    signed: signedFileUrl,
    certificate: certificateUrl,
    combined: combinedUrl ?? signedFileUrl,
  };
  const url = urls[which];
  const options: { id: Which; label: string }[] = [
    { id: "signed", label: "Signed document" },
    { id: "certificate", label: "Certificate of completion" },
    ...(combinedUrl
      ? [{ id: "combined" as const, label: "Signed + certificate" }]
      : []),
  ];
  const selectedLabel =
    options.find((option) => option.id === which)?.label ?? "Signed document";
  const shareable = useShareableFile(url, selectedLabel);

  const download = () => {
    const link = document.createElement("a");
    link.href = url;
    link.download = "";
    document.body.append(link);
    link.click();
    link.remove();
  };

  const saveOrShare = async () => {
    if (!shareable) {
      download();
      return;
    }
    try {
      await navigator.share({ files: [shareable], title: selectedLabel });
    } catch (err) {
      // Closing the share sheet is not a failure.
      if (err instanceof DOMException && err.name === "AbortError") return;
      download();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Phones: a one-line segmented control and a full-width button. */}
      <div className="flex flex-col gap-3 sm:hidden">
        <Segmented
          label="Completed files"
          onChange={setWhich}
          options={options.map((option) => ({
            value: option.id,
            label: option.label,
            shortLabel: SHORT[option.id],
          }))}
          value={which}
        />
        <Button
          className="h-12 w-full text-base"
          onClick={() => void saveOrShare()}
          type="button"
          variant="secondary"
        >
          {shareable ? <Share aria-hidden /> : <Download aria-hidden />}
          {shareable ? "Save or share" : "Download"}
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 max-sm:hidden">
        <div
          aria-label="Completed files"
          className="inline-flex rounded-[14px] border-2 border-line bg-surface p-1 shadow-brut-sm"
          role="tablist"
        >
          {options.map((option, i) => (
            <button
              aria-controls={`${baseId}-panel`}
              aria-selected={which === option.id}
              className={`rounded-[10px] px-3 py-1.5 text-sm font-bold ${
                which === option.id
                  ? "bg-brand text-brand-ink"
                  : "text-ink hover:bg-tint"
              }`}
              id={`${baseId}-${option.id}`}
              key={option.id}
              onClick={() => setWhich(option.id)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const delta = e.key === "ArrowRight" ? 1 : -1;
                const next =
                  options[(i + delta + options.length) % options.length];
                setWhich(next.id);
                document.getElementById(`${baseId}-${next.id}`)?.focus();
              }}
              role="tab"
              tabIndex={which === option.id ? 0 : -1}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <a
          className="inline-flex items-center gap-1.5 text-sm font-bold text-subtle underline underline-offset-4 hover:text-ink pointer-coarse:min-h-11"
          download
          href={url}
        >
          <Download aria-hidden className="size-4" />
          Download
        </a>
      </div>
      <div
        aria-label={selectedLabel}
        className={cn(
          "rounded-[20px] border-2 border-line bg-raised p-3 sm:p-6",
          bleed &&
            "max-sm:-mx-5 max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0",
        )}
        id={`${baseId}-panel`}
        role="region"
      >
        <DocumentPages
          bleed={bleed}
          fileUrl={url}
          key={url}
          label={selectedLabel}
        />
      </div>
    </div>
  );
}
