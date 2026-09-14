"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageBox } from "@/components/documents/page-box";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { ApiError } from "@/lib/api/client";
import { createDocumentFromTemplate } from "@/lib/api/documents";
import { previewLetterheadHtml } from "@/lib/documents/letterhead-preview";
import {
  LETTERHEAD_PAGE_MIN_HEIGHT,
  LETTERHEAD_PAGE_WIDTH,
} from "@/lib/documents/page-size";
import {
  DOCUMENT_TEMPLATES,
  findDocumentTemplate,
} from "@/lib/documents/templates";
import { useSession } from "../../session";
import { Note, Panel, field, labelClass } from "../../users/ui";

export default function TemplatesPage() {
  const { user } = useSession();
  const router = useRouter();
  const [templateId, setTemplateId] = useState(DOCUMENT_TEMPLATES[0].id);
  const template = findDocumentTemplate(templateId) ?? DOCUMENT_TEMPLATES[0];
  const [category, setCategory] = useState(template.defaultCategory);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [bodyHtml, setBodyHtml] = useState(template.bodyHtml);
  const [previewBody, setPreviewBody] = useState(template.bodyHtml);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Debounced so the preview iframe (a full document reload on every srcDoc
  // change) doesn't flicker on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setPreviewBody(bodyHtml), 400);
    return () => clearTimeout(timer);
  }, [bodyHtml]);

  const pickTemplate = (id: string) => {
    const next = findDocumentTemplate(id);
    if (!next) return;
    setTemplateId(id);
    setCategory(next.defaultCategory);
    setBodyHtml(next.bodyHtml);
    setPreviewBody(next.bodyHtml);
  };

  const create = async () => {
    if (!category.trim() || !title.trim()) return;
    setCreating(true);
    setError(null);
    setNote(null);
    try {
      const result = await createDocumentFromTemplate({
        templateId,
        category: category.trim(),
        title: title.trim(),
        description: description.trim() || undefined,
        bodyHtml,
      });
      if ("pending" in result) {
        setNote("Submitted for a co-president to approve.");
      } else {
        router.push(`/admin/documents/${result.$key}`);
      }
    } catch (err) {
      setError(
        (err instanceof ApiError && err.detail) ||
          "Could not create that document.",
      );
    } finally {
      setCreating(false);
    }
  };

  if (!user?.isExecutive) {
    return (
      <div className="mx-auto w-full max-w-[1060px] px-5 py-8">
        <Note>Only signed-in execs can create documents.</Note>
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
        <h1 className="mt-2 text-2xl font-extrabold text-ink">
          Start from a template
        </h1>
        <p className="mt-1 max-w-prose text-subtle">
          Branded BrockCSC stationery you edit and save straight into the
          document library.{" "}
          <Link
            className="font-bold text-brand underline underline-offset-4"
            href="/admin/documents/templates/help"
          >
            How to use templates
          </Link>
        </p>
      </div>

      {note && <p className="text-sm font-bold text-brand">{note}</p>}
      {error && <p className="text-sm font-bold text-destructive">{error}</p>}

      <Panel title="1. Pick a template">
        <ToggleGroup
          label="Template"
          onChange={pickTemplate}
          options={DOCUMENT_TEMPLATES.map((t) => ({
            value: t.id,
            label: t.name,
          }))}
          value={templateId}
        />
        <p className="mt-3 text-sm text-subtle">{template.blurb}</p>
      </Panel>

      <Panel title="2. Name it">
        <div className="flex flex-col gap-4">
          <div>
            <label className={labelClass} htmlFor="template-title">
              Title
            </label>
            <input
              className={field}
              id="template-title"
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 2026 Banking Resolution"
              value={title}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="template-category">
              Category
            </label>
            <input
              className={field}
              id="template-category"
              onChange={(e) => setCategory(e.target.value)}
              value={category}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="template-description">
              Description (optional)
            </label>
            <textarea
              className={`${field} min-h-[70px]`}
              id="template-description"
              onChange={(e) => setDescription(e.target.value)}
              value={description}
            />
          </div>
        </div>
      </Panel>

      <Panel
        note="The header, footer and colours come from the template. Only this body is yours to change."
        title="3. Edit the body"
      >
        <RichTextEditor
          onChange={setBodyHtml}
          resetKey={templateId}
          value={bodyHtml}
        />
      </Panel>

      <Panel title="Preview">
        <div className="overflow-x-auto rounded-[14px] border-2 border-line bg-tint p-3">
          <PageBox
            height={LETTERHEAD_PAGE_MIN_HEIGHT}
            width={LETTERHEAD_PAGE_WIDTH}
          >
            <iframe
              className="size-full border-0"
              sandbox=""
              srcDoc={previewLetterheadHtml({
                title: title || "Untitled document",
                category,
                bodyHtml: previewBody,
              })}
              title="Document preview"
            />
          </PageBox>
        </div>
      </Panel>

      <div>
        <Button
          disabled={creating || !category.trim() || !title.trim()}
          onClick={create}
          type="button"
          variant="primary"
        >
          {creating ? "Creating..." : "Create document"}
        </Button>
        {!user.isApprover && (
          <p className="mt-2 text-xs text-subtle">
            A co-president reviews this before it&apos;s added to the library.
          </p>
        )}
      </div>
    </div>
  );
}
