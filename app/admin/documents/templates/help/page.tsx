"use client";

import Link from "next/link";
import { Panel } from "../../../users/ui";

export default function TemplatesHelpPage() {
  return (
    <div className="mx-auto w-full max-w-[700px] px-5 py-10">
      <Link
        className="text-sm font-bold text-brand underline underline-offset-4"
        href="/admin/documents/templates"
      >
        Back to templates
      </Link>
      <h1 className="mt-3 text-3xl font-extrabold text-ink">
        How to use templates
      </h1>
      <p className="mt-2 max-w-prose text-subtle">
        A branded starting point for correspondence that should look like it
        came from BrockCSC, filled in with whatever you already use.
      </p>

      <div className="mt-6 flex flex-col gap-6">
        <Panel title="Download">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
            <li>
              Pick whichever template is the closest match, and whichever format
              you&apos;d rather edit in — a blank letterhead works for anything
              that doesn&apos;t fit the others.
            </li>
            <li>
              Every template already has the club logo, name, address and brand
              colours in its header.
            </li>
          </ul>
        </Panel>

        <Panel title="Fill it in">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
            <li>
              Open the download in Word, Google Docs, a PDF editor — whatever
              handles the format you picked — and replace the bracketed
              placeholders.
            </li>
          </ul>
        </Panel>

        <Panel title="Save it as a PDF">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
            <li>
              The document library only takes PDFs, so export the filled-in
              template as one before you upload it.
            </li>
            <li>
              In Word, use File, then Save As, and pick PDF. In Google Docs, use
              File, then Download, then PDF Document. A PDF editor can save
              straight to PDF.
            </li>
            <li>
              Open the PDF once to check nothing moved before you upload it.
            </li>
          </ul>
        </Panel>

        <Panel title="Upload it back">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
            <li>
              Back in the document library, upload the PDF the same way
              you&apos;d upload anything else.
            </li>
            <li>
              If you&apos;re not a co-president, a co-president reviews it
              before it takes effect.
            </li>
            <li>
              If it needs signatures, start a signing request on it and place
              each signer&apos;s fields where they should go. Everyone needs at
              least one Signature field.
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
