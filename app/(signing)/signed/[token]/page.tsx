"use client";

import { RotateCw } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CompletedDocuments } from "@/components/documents/signing/completed-documents";
import {
  BrandMark,
  EnvelopeHeader,
  cardClass,
} from "@/components/documents/signing/envelope-header";
import { SigningSkeleton } from "@/components/documents/signing/signing-flow";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { fetchCompletedEnvelope } from "@/lib/api/signing";
import type { CompletedEnvelopeView } from "@/lib/api/types";

type LoadError = { kind: "link" | "network"; message: string };

export default function SignedEnvelopePage() {
  const token = (useParams().token as string) ?? "";
  const [view, setView] = useState<CompletedEnvelopeView | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchCompletedEnvelope(token);
        if (cancelled) return;
        setError(null);
        setView(data);
      } catch (err) {
        if (cancelled) return;
        // A 4xx is the link itself; a network error or 5xx may pass.
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          setError({
            kind: "link",
            message:
              err.detail ||
              "This link is invalid or has expired. Ask the sender to send it again.",
          });
        } else {
          setError({
            kind: "network",
            message:
              "Check your connection, then try again. Your link is still good.",
          });
        }
      } finally {
        if (!cancelled) setRetrying(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  return (
    <div className="flex flex-col gap-5 py-3 desk:py-10">
      {error ? (
        <div className={cardClass}>
          <BrandMark className="phone:hidden" />
          <h1 className="mt-4 text-2xl font-extrabold text-brand phone:mt-0">
            {error.kind === "network"
              ? "Couldn't reach BrockCSC Sign"
              : "This link doesn't work"}
          </h1>
          <p className="mt-2 text-[15px] text-subtle sm:text-sm" role="alert">
            {error.message}
          </p>
          {error.kind === "network" && (
            <Button
              aria-busy={retrying || undefined}
              className="mt-5 max-sm:h-12 max-sm:w-full"
              disabled={retrying}
              onClick={() => {
                setRetrying(true);
                setAttempt((n) => n + 1);
              }}
              type="button"
              variant="outline"
            >
              <RotateCw aria-hidden />
              {retrying ? "Trying again…" : "Try again"}
            </Button>
          )}
        </div>
      ) : !view ? (
        <SigningSkeleton brandless />
      ) : (
        <>
          <div className={cardClass}>
            <EnvelopeHeader
              brandless
              compact="consent"
              documentTitle={view.documentTitle}
              envelopeId={view.envelopeId}
              heading="h1"
              title={view.requestTitle}
            />
            <p className="mt-4 inline-flex flex-wrap items-center gap-2 text-sm text-ink phone:mt-2">
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
            bleed
            certificateUrl={view.certificateUrl}
            combinedUrl={view.combinedUrl}
            signedFileUrl={view.signedFileUrl}
          />
        </>
      )}
    </div>
  );
}
