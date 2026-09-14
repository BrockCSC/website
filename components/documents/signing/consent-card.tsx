"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SignerSessionView } from "@/lib/api/types";
import { DISCLOSURE_FULL, DISCLOSURE_SHORT } from "@/lib/documents/disclosure";
import { EnvelopeHeader, cardClass } from "./envelope-header";

const [DISCLOSURE_TITLE, ...DISCLOSURE_PARAGRAPHS] =
  DISCLOSURE_FULL.split("\n\n");

export function ConsentCard({
  session,
  heading,
  busy,
  error,
  onContinue,
  onDecline,
}: {
  session: SignerSessionView;
  heading: "h1" | "h2";
  busy: boolean;
  error: string | null;
  onContinue: () => void;
  onDecline: () => void;
}) {
  const baseId = useId();
  const [open, setOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);

  return (
    <div className={cardClass}>
      <EnvelopeHeader
        documentTitle={session.documentTitle}
        heading={heading}
        title={session.requestTitle}
      />
      <p className="mt-4 text-base text-ink">
        <strong>{session.requesterName}</strong> sent you a document to review
        and sign.
      </p>

      <div className="mt-5 rounded-[14px] border-2 border-line bg-tint p-4">
        <p className="text-sm text-ink">{DISCLOSURE_SHORT}</p>
        <button
          aria-controls={`${baseId}-disclosure`}
          aria-expanded={open}
          className="mt-2 inline-flex items-center gap-1 text-left text-sm font-bold text-brand underline underline-offset-4"
          onClick={() => setOpen((v) => !v)}
          type="button"
        >
          {open ? "Hide" : "Read"} the {DISCLOSURE_TITLE}
          <ChevronDown
            aria-hidden
            className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        <div
          className="mt-3 max-h-[45vh] overflow-y-auto rounded-[10px] border-2 border-line bg-surface p-4 text-sm text-ink"
          hidden={!open}
          id={`${baseId}-disclosure`}
        >
          <h3 className="font-extrabold">{DISCLOSURE_TITLE}</h3>
          {DISCLOSURE_PARAGRAPHS.map((paragraph) => (
            <p className="mt-3" key={paragraph}>
              {paragraph}
            </p>
          ))}
        </div>
      </div>

      <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm font-bold text-ink">
        <input
          checked={agreed}
          className="check mt-0.5"
          onChange={(e) => setAgreed(e.target.checked)}
          type="checkbox"
        />
        I agree to use electronic records and signatures
      </label>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button disabled={!agreed || busy} onClick={onContinue} type="button">
          {busy ? "Continuing..." : "Continue"}
        </Button>
        <Button
          disabled={busy}
          onClick={onDecline}
          type="button"
          variant="outline"
        >
          Decline to sign
        </Button>
      </div>
      {error && (
        <p className="mt-4 text-sm font-bold text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
