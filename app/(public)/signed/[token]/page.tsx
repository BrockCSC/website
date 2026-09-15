"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CompletedDocuments } from "@/components/documents/signing/completed-documents";
import {
  BrandMark,
  EnvelopeHeader,
  cardClass,
} from "@/components/documents/signing/envelope-header";
import { ApiError } from "@/lib/api/client";
import { fetchCompletedEnvelope } from "@/lib/api/signing";
import type { CompletedEnvelopeView } from "@/lib/api/types";

export default function SignedEnvelopePage() {
  const token = (useParams().token as string) ?? "";
  const [view, setView] = useState<CompletedEnvelopeView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchCompletedEnvelope(token);
        if (!cancelled) setView(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            (err instanceof ApiError && err.detail) ||
              "This link is invalid or has expired.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="flex flex-col gap-5 py-8 sm:py-10">
      {error ? (
        <div className={cardClass}>
          <BrandMark />
          <h1 className="mt-4 text-2xl font-extrabold text-brand">
            This link doesn&apos;t work
          </h1>
          <p className="mt-2 text-sm text-subtle" role="alert">
            {error}
          </p>
        </div>
      ) : !view ? (
        <div className={`${cardClass} animate-pulse`}>
          <BrandMark />
          <p className="mt-4 text-sm font-bold text-subtle">Loading...</p>
        </div>
      ) : (
        <>
          <div className={cardClass}>
            <EnvelopeHeader
              documentTitle={view.documentTitle}
              envelopeId={view.envelopeId}
              heading="h1"
              title={view.requestTitle}
            />
            <p className="mt-4 inline-flex flex-wrap items-center gap-2 text-sm text-ink">
              <span className="rounded-full border-2 border-line bg-brand px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-brand-ink uppercase">
                Completed
              </span>
              {new Date(view.completedAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>
          <CompletedDocuments
            certificateUrl={view.certificateUrl}
            combinedUrl={view.combinedUrl}
            signedFileUrl={view.signedFileUrl}
          />
        </>
      )}
    </div>
  );
}
