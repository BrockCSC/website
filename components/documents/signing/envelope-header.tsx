import { Signature } from "lucide-react";

export const cardClass =
  "rounded-[20px] border-2 border-line bg-surface p-5 text-ink shadow-brut sm:p-7";

export function BrandMark() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-line bg-slab px-2.5 py-0.5 text-[11px] font-extrabold tracking-wide text-slab-ink uppercase">
      <Signature aria-hidden className="size-3.5 text-slab-brand" />
      BrockCSC Sign
    </span>
  );
}

/** Title block shared by every signer-facing state. */
export function EnvelopeHeader({
  heading: Heading,
  title,
  documentTitle,
  from,
  envelopeId,
}: {
  heading: "h1" | "h2";
  title: string;
  documentTitle?: string;
  from?: string;
  envelopeId?: string;
}) {
  return (
    <div className="min-w-0">
      <BrandMark />
      <Heading
        className="mt-3 text-2xl font-extrabold break-words text-brand focus:outline-none"
        data-flow-heading
        tabIndex={-1}
      >
        {title}
      </Heading>
      {documentTitle && documentTitle !== title && (
        <p className="mt-0.5 font-bold break-words text-ink">{documentTitle}</p>
      )}
      {from && <p className="mt-1 text-sm text-subtle">From {from}</p>}
      {envelopeId && (
        <p className="mt-1 font-mono text-[11px] break-all text-subtle">
          Envelope ID: {envelopeId}
        </p>
      )}
    </div>
  );
}
