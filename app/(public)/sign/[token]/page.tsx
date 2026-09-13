"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import {
  fetchSignerView,
  respondAsSigner,
  signerFileUrl,
  type SafeSigner,
} from "@/lib/api/documents";

const field =
  "w-full rounded-[10px] border-2 border-line bg-surface px-3 py-2 text-ink";

type View = {
  document: { title: string; category: string } | null;
  signingRequestTitle: string;
  signingRequestStatus: string;
  mode: "ordered" | "parallel";
  signer: SafeSigner;
  otherSigners: { order: number; status: string }[];
  canRespond: boolean;
};

export default function SignPage() {
  const token = (useParams().token as string) ?? "";
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signatureText, setSignatureText] = useState("");
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<"signed" | "declined" | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setView(await fetchSignerView(token));
      } catch (err) {
        setError(
          (err instanceof ApiError && err.detail) ||
            "This signing link is invalid or has expired.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const sign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signatureText.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await respondAsSigner(token, {
        action: "sign",
        signatureText: signatureText.trim(),
      });
      setDone("signed");
    } catch (err) {
      setError(
        (err instanceof ApiError && err.detail) ||
          "Could not record your signature.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const decline = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await respondAsSigner(token, {
        action: "decline",
        reason: declineReason.trim() || undefined,
      });
      setDone("declined");
    } catch (err) {
      setError(
        (err instanceof ApiError && err.detail) || "Could not record that.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-stretch justify-center gap-6 py-10">
      <div className="rounded-[20px] border-2 border-line bg-surface p-6 shadow-brut sm:p-8">
        {loading ? (
          <p className="text-center text-sm text-subtle">Loading...</p>
        ) : error && !view ? (
          <>
            <h1 className="text-center text-2xl font-extrabold text-brand">
              Invalid link
            </h1>
            <p className="mt-3 text-center text-sm text-subtle">{error}</p>
          </>
        ) : done ? (
          <>
            <h1 className="text-center text-2xl font-extrabold text-brand">
              {done === "signed" ? "Signed" : "Response recorded"}
            </h1>
            <p className="mt-3 text-center text-sm text-subtle">
              {done === "signed"
                ? "Thanks — your signature has been recorded."
                : "You've declined to sign. The requester has been notified."}
            </p>
          </>
        ) : view ? (
          <>
            <h1 className="mb-1 text-2xl font-extrabold text-brand">
              {view.signingRequestTitle}
            </h1>
            {view.document && (
              <p className="mb-4 text-sm text-subtle">
                {view.document.title} — {view.document.category}
              </p>
            )}

            <a
              className="mb-6 inline-block font-bold text-brand underline underline-offset-4"
              href={signerFileUrl(token)}
              rel="noreferrer"
              target="_blank"
            >
              Open the document to review
            </a>

            {view.signingRequestStatus !== "sent" ? (
              <p className="rounded-[10px] border-2 border-line bg-tint p-3 text-sm text-ink">
                This signing request is {view.signingRequestStatus}. No further
                action is needed from you.
              </p>
            ) : view.signer.status === "signed" ? (
              <p className="rounded-[10px] border-2 border-line bg-tint p-3 text-sm text-ink">
                You already signed this on {view.signer.signedAt}.
              </p>
            ) : view.signer.status === "declined" ? (
              <p className="rounded-[10px] border-2 border-line bg-tint p-3 text-sm text-ink">
                You declined to sign this.
              </p>
            ) : !view.canRespond ? (
              <p className="rounded-[10px] border-2 border-line bg-tint p-3 text-sm text-ink">
                This request signs in order, and it isn&apos;t your turn yet.
                You&apos;ll get another email when it is.
              </p>
            ) : declining ? (
              <div>
                <label
                  className="mb-1 block text-sm font-bold"
                  htmlFor="reason"
                >
                  Reason (optional)
                </label>
                <textarea
                  className={`${field} min-h-[80px]`}
                  id="reason"
                  onChange={(e) => setDeclineReason(e.target.value)}
                  value={declineReason}
                />
                <div className="mt-4 flex gap-3">
                  <Button
                    disabled={submitting}
                    onClick={decline}
                    type="button"
                    variant="destructive"
                  >
                    {submitting ? "Submitting..." : "Confirm decline"}
                  </Button>
                  <Button
                    disabled={submitting}
                    onClick={() => setDeclining(false)}
                    type="button"
                    variant="secondary"
                  >
                    Back
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={sign}>
                <label
                  className="mb-1 block text-sm font-bold"
                  htmlFor="signature"
                >
                  Type your full name to sign
                </label>
                <input
                  className={field}
                  id="signature"
                  onChange={(e) => setSignatureText(e.target.value)}
                  placeholder="Full name"
                  value={signatureText}
                />
                <p className="mt-1 text-xs text-subtle">
                  This records your typed name, the time, and your IP address as
                  your signature. This is an internal club record, not a
                  certified electronic signature.
                </p>
                <div className="mt-4 flex gap-3">
                  <Button
                    disabled={submitting || !signatureText.trim()}
                    type="submit"
                    variant="primary"
                  >
                    {submitting ? "Signing..." : "Sign"}
                  </Button>
                  <Button
                    disabled={submitting}
                    onClick={() => setDeclining(true)}
                    type="button"
                    variant="outline"
                  >
                    Decline
                  </Button>
                </div>
              </form>
            )}

            {error && (
              <p
                className="mt-4 text-sm font-bold text-destructive"
                role="alert"
              >
                {error}
              </p>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}
