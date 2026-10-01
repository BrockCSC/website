"use client";

import {
  Award,
  Check,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  Files,
  Share,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  combinedFileUrl,
  documentFileUrl,
  type SigningRequestItem,
} from "@/lib/api/documents";
import { PHONE_QUERY, usePhone } from "@/lib/use-media-query";
import { useStackParam } from "@/lib/use-stack-param";
import { DocumentPreview } from "./document-preview";
import { DocumentViewer } from "./document-viewer";

type CompletedFile = {
  key: string;
  label: string;
  icon: LucideIcon;
  url: string;
  downloadName: string;
  contentType: string;
  sha256?: string;
  /** The combined copy is generated on request; there's nothing to preview inline. */
  previewable?: boolean;
};

const completedFiles = (request: SigningRequestItem): CompletedFile[] => {
  if (!request.resultingVersionId) return [];
  if (!request.certificateVersionId) {
    return [
      {
        key: "record",
        label: "Completion record",
        icon: FileCheck2,
        url: documentFileUrl(request.resultingVersionId),
        downloadName: `${request.title} - signing certificate.txt`,
        contentType: "text/plain",
        sha256: request.sha256,
        previewable: true,
      },
    ];
  }
  return [
    {
      key: "combined",
      label: "Signed document + certificate",
      icon: Files,
      url: combinedFileUrl(request.$key),
      downloadName: `${request.title} - signed with certificate.pdf`,
      contentType: "application/pdf",
    },
    {
      key: "signed",
      label: "Signed document",
      icon: FileCheck2,
      url: documentFileUrl(request.resultingVersionId),
      downloadName: `${request.title} - signed.pdf`,
      contentType: "application/pdf",
      sha256: request.sha256,
      previewable: true,
    },
    {
      key: "certificate",
      label: "Certificate of Completion",
      icon: Award,
      url: documentFileUrl(request.certificateVersionId),
      downloadName: `${request.title} - Certificate of Completion.pdf`,
      contentType: "application/pdf",
      sha256: request.certificateSha256,
      previewable: true,
    },
  ];
};

const envelopeLabel = (request: SigningRequestItem) =>
  request.envelopeId ?? request.$key.toUpperCase();

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      aria-label={`Copy ${label}`}
      className="press-flat inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[10px] border-2 border-[var(--line-strong)] px-3 text-sm font-bold text-ink"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast({ message: "Fingerprint copied" });
        } catch {
          toast({ message: "Could not copy that.", tone: "error" });
        }
      }}
      type="button"
    >
      {copied ? (
        <Check aria-hidden className="size-4" />
      ) : (
        <Copy aria-hidden className="size-4" />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

const downloadFile = (file: CompletedFile) => {
  const link = document.createElement("a");
  link.href = file.url;
  link.download = file.downloadName;
  document.body.appendChild(link);
  link.click();
  link.remove();
};

/**
 * Phones: one 56px row per file that opens the full-screen viewer, with a
 * trailing share button; the fingerprints sit behind a disclosure.
 */
function PhoneCompletedDocuments({
  request,
  files,
}: {
  request: SigningRequestItem;
  files: CompletedFile[];
}) {
  const view = useStackParam("view", { push: PHONE_QUERY });
  const blobs = useRef(new Map<string, Promise<Blob>>());
  const viewing = files.find((f) => f.key === view.value) ?? null;
  const fingerprinted = files.filter((f) => f.sha256);

  // Started on pointerdown, so the bytes are usually in hand by the click
  // and the share sheet still opens inside the tap's user activation.
  const blobFor = (file: CompletedFile) => {
    let blob = blobs.current.get(file.url);
    if (!blob) {
      blob = fetch(file.url, { credentials: "same-origin" }).then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.blob();
      });
      blob.catch(() => blobs.current.delete(file.url));
      blobs.current.set(file.url, blob);
    }
    return blob;
  };

  const share = async (file: CompletedFile) => {
    if (typeof navigator.canShare !== "function") {
      downloadFile(file);
      return;
    }
    try {
      const blob = await blobFor(file);
      const shared = new File([blob], file.downloadName, {
        type: blob.type || file.contentType,
      });
      if (!navigator.canShare({ files: [shared] })) {
        downloadFile(file);
        return;
      }
      await navigator.share({ files: [shared], title: file.label });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        // The fetch outlasted the tap's activation; the file is cached now.
        toast({ message: "Ready. Tap Share again." });
        return;
      }
      toast({ message: "Could not share that file.", tone: "error" });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        <span className="font-semibold text-subtle">Envelope ID</span>{" "}
        <span className="font-mono text-sm font-semibold wrap-anywhere text-ink">
          {envelopeLabel(request)}
        </span>
      </p>

      {!request.certificateVersionId && (
        <p className="text-sm text-subtle">
          Signed before BrockCSC Sign stamped PDFs, so this request has a
          plain-text completion record instead of a signed PDF and certificate.
        </p>
      )}

      <ul className="-mx-4 divide-y-2 divide-line/15 border-y-2 border-line/15">
        {files.map((file) => {
          const Icon = file.icon;
          return (
            <li className="flex items-center" key={file.key}>
              <button
                className="press-flat flex min-h-14 min-w-0 flex-1 items-center gap-3 pr-2 pl-4 text-left"
                onClick={() => view.open(file.key)}
                type="button"
              >
                <Icon aria-hidden className="size-5 shrink-0 text-ink" />
                <span className="min-w-0 flex-1 font-bold text-ink">
                  {file.label}
                </span>
                <ChevronRight
                  aria-hidden
                  className="size-5 shrink-0 text-subtle"
                />
              </button>
              <button
                aria-label={`Share ${file.label}`}
                className="press-flat mr-2 grid size-11 shrink-0 place-items-center rounded-[10px] text-ink"
                onClick={() => void share(file)}
                onPointerDown={() => {
                  if (typeof navigator.canShare === "function")
                    blobFor(file).catch(() => {});
                }}
                type="button"
              >
                <Share aria-hidden className="size-5" strokeWidth={2.25} />
              </button>
            </li>
          );
        })}
      </ul>

      {fingerprinted.length > 0 && (
        <details className="group rounded-[14px] border-2 border-line">
          <summary className="press-flat flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-[12px] px-4 font-bold text-ink [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1">Verify fingerprint</span>
            <ChevronRight
              aria-hidden
              className="size-5 shrink-0 text-subtle transition-transform group-open:rotate-90"
            />
          </summary>
          <ul className="flex flex-col gap-4 border-t-2 border-line/15 px-4 pt-3 pb-4">
            {fingerprinted.map((file) => (
              <li key={file.key}>
                <p className="text-sm font-bold text-ink">{file.label}</p>
                <div className="mt-1 flex items-start gap-3">
                  <p className="min-w-0 flex-1 font-mono text-sm wrap-anywhere text-subtle">
                    SHA-256 {file.sha256}
                  </p>
                  <CopyButton
                    label={`${file.label} fingerprint`}
                    value={file.sha256!}
                  />
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      <DocumentViewer
        file={
          viewing
            ? {
                url: viewing.url,
                name: viewing.downloadName,
                contentType: viewing.contentType,
              }
            : null
        }
        onClose={view.close}
        open={viewing != null}
      />
    </div>
  );
}

export function CompletedDocuments({
  request,
}: {
  request: SigningRequestItem;
}) {
  const phone = usePhone();
  const [open, setOpen] = useState<string | null>(null);
  const files = completedFiles(request);
  if (!files.length) return null;
  if (phone) return <PhoneCompletedDocuments files={files} request={request} />;
  const openFile = files.find((f) => f.key === open);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        <span className="font-semibold text-subtle">Envelope ID</span>{" "}
        <span className="font-mono text-xs font-semibold break-all text-ink sm:text-sm">
          {envelopeLabel(request)}
        </span>
      </p>

      {!request.certificateVersionId && (
        <p className="text-xs text-subtle">
          Signed before BrockCSC Sign stamped PDFs, so this request has a
          plain-text completion record instead of a signed PDF and certificate.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {files.map((file) => {
          const Icon = file.icon;
          return (
            <li
              className="rounded-[14px] border-2 border-line bg-surface p-3"
              key={file.key}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-2 font-bold text-ink">
                  <Icon aria-hidden className="size-4 shrink-0 text-brand" />
                  {file.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {file.previewable && (
                    <>
                      <Button
                        aria-controls="completed-preview"
                        aria-expanded={open === file.key}
                        onClick={() =>
                          setOpen((current) =>
                            current === file.key ? null : file.key,
                          )
                        }
                        size="xs"
                        type="button"
                        variant={open === file.key ? "primary" : "secondary"}
                      >
                        {open === file.key ? "Hide" : "View"}
                      </Button>
                      <Button asChild size="xs" variant="outline">
                        <a href={file.url} rel="noreferrer" target="_blank">
                          <ExternalLink aria-hidden />
                          New tab
                        </a>
                      </Button>
                    </>
                  )}
                  <Button asChild size="xs" variant="outline">
                    <a download={file.downloadName} href={file.url}>
                      <Download aria-hidden />
                      Download
                    </a>
                  </Button>
                </div>
              </div>
              {file.sha256 && (
                <p className="mt-2 text-xs text-subtle">
                  SHA-256{" "}
                  <span className="font-mono break-all text-ink">
                    {file.sha256}
                  </span>
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {openFile && (
        <div id="completed-preview">
          <p className="mb-2 text-xs font-extrabold tracking-wide text-subtle uppercase">
            {openFile.label}
          </p>
          <DocumentPreview
            contentType={openFile.contentType}
            fileUrl={openFile.url}
            key={openFile.url}
          />
        </div>
      )}
    </div>
  );
}
