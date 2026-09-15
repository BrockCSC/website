"use client";

import {
  Award,
  Download,
  ExternalLink,
  FileCheck2,
  Files,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  combinedFileUrl,
  documentFileUrl,
  type SigningRequestItem,
} from "@/lib/api/documents";
import { DocumentPreview } from "./document-preview";

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

export function CompletedDocuments({
  request,
}: {
  request: SigningRequestItem;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const files = completedFiles(request);
  if (!files.length) return null;
  const openFile = files.find((f) => f.key === open);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        <span className="font-semibold text-subtle">Envelope ID</span>{" "}
        <span className="font-mono text-xs font-semibold break-all text-ink sm:text-sm">
          {request.envelopeId ?? request.$key.toUpperCase()}
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
