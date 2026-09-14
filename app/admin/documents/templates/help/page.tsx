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
        A quick starting point for correspondence that should look like it came
        from BrockCSC, without uploading a file from your own computer.
      </p>

      <div className="mt-6 flex flex-col gap-6">
        <Panel title="Pick a template">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
            <li>
              Choose the closest match — a blank letterhead works for anything
              that doesn&apos;t fit the others.
            </li>
            <li>
              Every template already has the club logo, name, address and brand
              colours in its header and footer.
            </li>
          </ul>
        </Panel>

        <Panel title="Edit the branded areas">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
            <li>
              Give it a title and category, then write the body in the editor
              below — bold, italic, headings, lists and alignment are all in the
              toolbar.
            </li>
            <li>
              The letterhead header and footer stay fixed; only the body is
              yours to change.
            </li>
            <li>Check the preview panel to see exactly what gets saved.</li>
          </ul>
        </Panel>

        <Panel title="Save">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
            <li>
              Creating the document adds it to the library like any upload.
            </li>
            <li>
              If you&apos;re not a co-president, a co-president reviews it
              before it takes effect — same as an upload or a signing request.
            </li>
            <li>
              Once it&apos;s in the library, you can start a signing request on
              it exactly like any other document.
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
