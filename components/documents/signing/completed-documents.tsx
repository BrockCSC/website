"use client";

import { Download } from "lucide-react";
import { useId, useState } from "react";
import { DocumentPages } from "./document-pages";

type Which = "signed" | "certificate" | "combined";

/** The stamped PDF and its Certificate of Completion, one at a time, read-only. */
export function CompletedDocuments({
  signedFileUrl,
  certificateUrl,
  combinedUrl,
}: {
  signedFileUrl: string;
  certificateUrl: string;
  combinedUrl?: string;
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
          className="inline-flex items-center gap-1.5 text-sm font-bold text-subtle underline underline-offset-4 hover:text-ink"
          download
          href={url}
        >
          <Download aria-hidden className="size-4" />
          Download
        </a>
      </div>
      <div
        aria-labelledby={`${baseId}-${which}`}
        className="rounded-[20px] border-2 border-line bg-raised p-3 sm:p-6"
        id={`${baseId}-panel`}
        role="tabpanel"
      >
        <DocumentPages
          fileUrl={url}
          key={url}
          label={which === "signed" ? "Signed document" : "Certificate"}
        />
      </div>
    </div>
  );
}
