"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { templateFileUrl } from "@/lib/api/documents";
import { DOCUMENT_TEMPLATES } from "@/lib/documents/templates";
import { useSession } from "../../session";
import { Note } from "../../users/ui";

export default function TemplatesPage() {
  const { user } = useSession();

  if (!user?.isExecutive) {
    return (
      <div className="mx-auto w-full max-w-[1060px] px-5 py-8">
        <Note>Only signed-in execs can download templates.</Note>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1060px] flex-col gap-6 px-5 py-8">
      <div>
        <Link
          className="text-sm font-bold text-subtle hover:text-ink"
          href="/admin/documents"
        >
          ← Documents
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold text-ink">Templates</h1>
        <p className="mt-1 max-w-prose text-subtle">
          Branded BrockCSC letterhead you download, fill in with your own
          software, and upload back to the library.{" "}
          <Link
            className="font-bold text-brand underline underline-offset-4"
            href="/admin/documents/templates/help"
          >
            How to use templates
          </Link>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {DOCUMENT_TEMPLATES.map((template) => (
          <div
            className="animate-fade-in rounded-[16px] border-2 border-line bg-surface p-4 shadow-brut transition-shadow duration-[var(--dur)] ease-smooth hover:shadow-[6px_6px_0_0_var(--brand)]"
            key={template.id}
          >
            <h2 className="text-base font-extrabold text-ink">
              {template.name}
            </h2>
            <p className="mt-1 text-sm text-subtle">{template.blurb}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="primary">
                <a href={templateFileUrl(template.id, "docx")}>
                  <Download aria-hidden />
                  Download .docx
                </a>
              </Button>
              <Button asChild size="sm" variant="secondary">
                <a href={templateFileUrl(template.id, "pdf")}>
                  <Download aria-hidden />
                  Download PDF
                </a>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
