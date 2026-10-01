"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { templateFileUrl } from "@/lib/api/documents";
import { DOCUMENT_TEMPLATES } from "@/lib/documents/templates";
import { usePhone } from "@/lib/use-media-query";
import { useTopBar } from "../../chrome";
import { AdminPage } from "../../page-frame";
import { useSession } from "../../session";
import { Note } from "../../users/ui";

export default function TemplatesPage() {
  const { user } = useSession();
  // One brand-red action per phone screen (D21): both downloads are equal there.
  const phone = usePhone();

  useTopBar({
    back: { label: "Documents", href: "/admin/documents" },
    title: "Templates",
  });

  if (!user?.isExecutive) {
    return (
      <AdminPage>
        <Note>Only signed-in execs can download templates.</Note>
      </AdminPage>
    );
  }

  return (
    <AdminPage className="flex flex-col gap-6">
      <div>
        <Link
          className="text-sm font-bold text-subtle hover:text-ink phone:hidden desk:pointer-coarse:inline-flex desk:pointer-coarse:min-h-11 desk:pointer-coarse:items-center"
          href="/admin/documents"
        >
          ← Documents
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold text-ink phone:mt-0">
          Templates
        </h1>
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
            className="animate-fade-in rounded-[16px] border-2 border-line bg-surface p-4 shadow-brut transition-shadow duration-[var(--dur)] ease-smooth hover:shadow-[6px_6px_0_0_var(--brand)] max-md:shadow-none max-md:hover:shadow-none"
            key={template.id}
          >
            <h2 className="text-base font-extrabold text-ink">
              {template.name}
            </h2>
            <p className="mt-1 text-sm text-subtle max-md:text-base">
              {template.blurb}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 max-sm:grid max-sm:grid-cols-2">
              <Button
                asChild
                className="pointer-coarse:h-11"
                size="sm"
                variant={phone ? "secondary" : "primary"}
              >
                <a
                  aria-label={`Download ${template.name} as .docx`}
                  href={templateFileUrl(template.id, "docx")}
                >
                  <Download aria-hidden />
                  {phone ? ".docx" : "Download .docx"}
                </a>
              </Button>
              <Button
                asChild
                className="pointer-coarse:h-11"
                size="sm"
                variant="secondary"
              >
                <a
                  aria-label={`Download ${template.name} as PDF`}
                  href={templateFileUrl(template.id, "pdf")}
                >
                  <Download aria-hidden />
                  {phone ? "PDF" : "Download PDF"}
                </a>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </AdminPage>
  );
}
