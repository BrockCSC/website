import { ChevronDown, Signature } from "lucide-react";
import { cn } from "@/lib/utils";

export const cardClass =
  "rounded-[20px] border-2 border-line bg-surface p-5 text-ink shadow-brut phone:shadow-none sm:p-7 short:py-4!";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border-2 border-line bg-slab px-2.5 py-0.5 text-[11px] font-extrabold tracking-wide text-slab-ink uppercase",
        className,
      )}
    >
      <Signature aria-hidden className="size-3.5 text-slab-brand" />
      BrockCSC Sign
    </span>
  );
}

/**
 * Title block shared by every signer-facing state.
 *
 * `compact` (phones only, landscape included): the title is clamped, and the document title
 * and envelope ID fold into a Details disclosure, so the document itself
 * starts above the fold on a phone. `brandless` drops the BrandMark on phones,
 * where the page header already says "BrockCSC Sign".
 */
export function EnvelopeHeader({
  heading: Heading,
  title,
  documentTitle,
  from,
  envelopeId,
  compact,
  brandless = false,
}: {
  heading: "h1" | "h2";
  title: string;
  documentTitle?: string;
  from?: string;
  envelopeId?: string;
  compact?: "sign" | "consent";
  brandless?: boolean;
}) {
  const showDocumentTitle = !!documentTitle && documentTitle !== title;
  const folded = !!compact && (showDocumentTitle || !!envelopeId);
  return (
    <div
      className="min-w-0"
      // The portal page hides its own duplicate H1 on phones when this is present.
      data-signing-header={Heading === "h2" ? "" : undefined}
    >
      <BrandMark className={brandless ? "phone:hidden" : undefined} />
      <Heading
        className={cn(
          "mt-3 text-2xl font-extrabold break-words text-brand focus:outline-none",
          brandless && "phone:mt-0",
          compact === "sign" &&
            "phone:line-clamp-2 phone:text-lg phone:leading-snug",
          compact === "consent" &&
            "phone:line-clamp-3 phone:leading-tight max-sm:text-xl",
        )}
        data-flow-heading
        tabIndex={-1}
      >
        {title}
      </Heading>
      {showDocumentTitle && (
        <p
          className={cn(
            "mt-0.5 font-bold break-words text-ink",
            compact && "phone:hidden",
          )}
        >
          {documentTitle}
        </p>
      )}
      {from && <p className="mt-1 text-sm text-subtle">From {from}</p>}
      {envelopeId && (
        <p
          className={cn(
            "mt-1 font-mono text-[11px] break-all text-subtle",
            compact && "phone:hidden",
          )}
        >
          Envelope ID: {envelopeId}
        </p>
      )}
      {folded && (
        <details
          className={cn(
            "group mt-1 desk:hidden",
            // Landscape phones: the sign bar ⋯ has Details; keep the page.
            compact === "sign" && "short:hidden",
          )}
        >
          <summary className="-mx-1 inline-flex min-h-11 cursor-pointer list-none items-center gap-1 px-1 text-sm font-bold text-subtle [&::-webkit-details-marker]:hidden">
            Details
            <ChevronDown
              aria-hidden
              className="size-4 transition-transform group-open:rotate-180"
            />
          </summary>
          <dl className="mb-1 grid gap-2 rounded-[10px] border-2 border-line bg-raised p-3 text-sm">
            {showDocumentTitle && (
              <div>
                <dt className="text-xs font-bold text-subtle">Document</dt>
                <dd className="font-bold wrap-anywhere text-ink">
                  {documentTitle}
                </dd>
              </div>
            )}
            {envelopeId && (
              <div>
                <dt className="text-xs font-bold text-subtle">Envelope ID</dt>
                <dd className="font-mono text-[13px] wrap-anywhere text-ink">
                  {envelopeId}
                </dd>
              </div>
            )}
          </dl>
        </details>
      )}
    </div>
  );
}
