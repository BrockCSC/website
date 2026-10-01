"use client";

import Link from "next/link";
import { usePhone } from "@/lib/use-media-query";
import { useTopBar } from "../../../chrome";
import { AdminPage } from "../../../page-frame";
import { Panel } from "../../../users/ui";

const STEPS: { title: string; items: React.ReactNode[] }[] = [
  {
    title: "Download",
    items: [
      <>
        Pick whichever template is the closest match, and whichever format
        you&apos;d rather edit in — a blank letterhead works for anything that
        doesn&apos;t fit the others.
      </>,
      <>
        Every template already has the club logo, name, address and brand
        colours in its header.
      </>,
    ],
  },
  {
    title: "Fill it in",
    items: [
      <>
        Open the download in Word, Google Docs, a PDF editor — whatever handles
        the format you picked — and replace the bracketed placeholders.
      </>,
    ],
  },
  {
    title: "Save it as a PDF",
    items: [
      <>
        The document library only takes PDFs, so export the filled-in template
        as one before you upload it.
      </>,
      <>
        In Word, use File, then Save As, and pick PDF. In Google Docs, use File,
        then Download, then PDF Document. A PDF editor can save straight to PDF.
      </>,
      <>Open the PDF once to check nothing moved before you upload it.</>,
    ],
  },
  {
    title: "Upload it back",
    items: [
      <>
        Back in the document library, upload the PDF the same way you&apos;d
        upload anything else.
      </>,
      <>
        If you&apos;re not a co-president, a co-president reviews it before it
        takes effect.
      </>,
      <>
        If it needs signatures, start a signing request on it and place each
        signer&apos;s fields where they should go. Everyone needs at least one
        Signature field.
      </>,
    ],
  },
];

export default function TemplatesHelpPage() {
  const phone = usePhone();

  useTopBar({
    back: { label: "Templates", href: "/admin/documents/templates" },
    title: "How to use templates",
  });

  return (
    <AdminPage className="max-w-[700px]" padY={10}>
      <Link
        className="text-sm font-bold text-subtle hover:text-ink phone:hidden desk:pointer-coarse:inline-flex desk:pointer-coarse:min-h-11 desk:pointer-coarse:items-center"
        href="/admin/documents/templates"
      >
        ← Templates
      </Link>
      <h1 className="mt-3 text-3xl font-extrabold text-ink phone:mt-0 phone:text-2xl">
        How to use templates
      </h1>
      <p className="mt-2 max-w-prose text-subtle">
        A branded starting point for correspondence that should look like it
        came from BrockCSC, filled in with whatever you already use.
      </p>

      {phone ? (
        // A numbered stepper: the steps are the content.
        <ol className="mt-6 flex flex-col">
          {STEPS.map((step, index) => {
            const last = index === STEPS.length - 1;
            return (
              <li className="relative flex gap-4" key={step.title}>
                {!last && (
                  <span
                    aria-hidden
                    className="absolute top-10 bottom-0 left-[19px] w-0.5 bg-line"
                  />
                )}
                <span
                  aria-hidden
                  className="relative grid size-10 shrink-0 place-items-center rounded-full border-2 border-line bg-ink text-base font-extrabold text-surface"
                >
                  {index + 1}
                </span>
                <div
                  className={last ? "min-w-0 pt-1.5" : "min-w-0 pt-1.5 pb-7"}
                >
                  <h2 className="text-lg font-extrabold text-ink">
                    <span className="sr-only">Step {index + 1}: </span>
                    {step.title}
                  </h2>
                  <ul className="mt-2 list-disc space-y-2 pl-5 text-base text-ink">
                    {step.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <ol className="mt-6 flex flex-col gap-6">
          {STEPS.map((step) => (
            <li key={step.title}>
              <Panel title={step.title}>
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink max-md:text-base">
                  {step.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </Panel>
            </li>
          ))}
        </ol>
      )}
    </AdminPage>
  );
}
