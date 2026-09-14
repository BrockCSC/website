"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import {
  fetchDocuments,
  fetchMyPendingActions,
  fetchPendingActions,
  pendingFileUrl,
  reviewPendingAction,
  uploadDocument,
  type DocumentItem,
  type PendingActionItem,
} from "@/lib/api/documents";
import { pdfUploadProblem } from "@/lib/documents/upload-check";
import { useSession } from "../session";
import { Note, Panel, Pill, field, labelClass } from "../users/ui";

const describePendingKind = (kind: PendingActionItem["kind"]) =>
  ({
    upload: "Upload a new document",
    replace: "Upload a new version",
    delete: "Delete a document",
    "start-signing": "Start a signing request",
    "add-signer": "Add a signer",
    "remove-signer": "Remove a signer",
    "cancel-signing": "Cancel a signing request",
  })[kind];

function PendingApprovals({ onChanged }: { onChanged: () => void }) {
  const [pending, setPending] = useState<PendingActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPending(await fetchPendingActions());
    } catch {
      setError("Could not load pending approvals.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const review = async (id: string, action: "approve" | "reject") => {
    setBusy(id);
    setError(null);
    try {
      await reviewPendingAction(id, action);
      await load();
      onChanged();
    } catch (err) {
      setError(
        (err instanceof ApiError && err.detail) || "Could not review that.",
      );
    } finally {
      setBusy(null);
    }
  };

  if (loading || !pending.length) return null;

  return (
    <Panel
      note="Actions from execs who aren't co-presidents wait here until approved."
      title="Pending approvals"
      tone="danger"
    >
      <ul className="flex flex-col gap-3">
        {pending.map((item) => (
          <li
            className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border-2 border-line bg-surface p-3"
            key={item.$key}
          >
            <div>
              <p className="font-bold text-ink">
                {describePendingKind(item.kind)}
              </p>
              <p className="text-xs text-subtle">
                Proposed by {item.proposedByName || item.proposedBy} at{" "}
                {new Date(item.proposedAt).toLocaleString()}
              </p>
              {item.target && (
                <div className="mt-1 text-xs text-ink">
                  {item.target.documentTitle && (
                    <p>{item.target.documentTitle}</p>
                  )}
                  {item.target.signingRequestTitle && (
                    <p>
                      &ldquo;{item.target.signingRequestTitle}&rdquo;
                      {item.target.signingRequestMode
                        ? item.target.signingRequestMode === "ordered"
                          ? " (in order)"
                          : " (parallel)"
                        : ""}
                    </p>
                  )}
                  {!!item.target.signers?.length && (
                    <p>
                      Signers:{" "}
                      {item.target.signers.map((s) => s.name).join(", ")}
                    </p>
                  )}
                  {item.target.note && <p>Note: {item.target.note}</p>}
                </div>
              )}
              {(item.kind === "upload" || item.kind === "replace") && (
                <a
                  className="text-xs font-bold text-brand underline underline-offset-4"
                  href={pendingFileUrl(item.$key)}
                  rel="noreferrer"
                  target="_blank"
                >
                  Preview file
                </a>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                disabled={busy === item.$key}
                onClick={() => review(item.$key, "approve")}
                size="sm"
                type="button"
                variant="primary"
              >
                Approve
              </Button>
              <Button
                disabled={busy === item.$key}
                onClick={() => review(item.$key, "reject")}
                size="sm"
                type="button"
                variant="destructive"
              >
                Reject
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {error && (
        <p className="mt-3 text-sm font-bold text-destructive">{error}</p>
      )}
    </Panel>
  );
}

const submissionTone = (status: PendingActionItem["status"]) =>
  status === "approved" ? "accent" : "flat";

function MySubmissions() {
  const [items, setItems] = useState<PendingActionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchMyPendingActions()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || !items.length) return null;

  return (
    <Panel
      note="What you've submitted, and whether a co-president has reviewed it."
      title="Your submissions"
    >
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li
            className="rounded-[14px] border-2 border-line bg-surface p-3"
            key={item.$key}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-ink">
                {describePendingKind(item.kind)}
              </p>
              <Pill tone={submissionTone(item.status)}>{item.status}</Pill>
            </div>
            {item.target?.documentTitle && (
              <p className="text-xs text-subtle">{item.target.documentTitle}</p>
            )}
            {item.status === "rejected" && item.rejectionReason && (
              <p className="mt-1 text-xs font-bold text-destructive">
                Rejected: {item.rejectionReason}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export default function DocumentsPage() {
  const { user } = useSession();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDocuments(await fetchDocuments());
      setError(null);
    } catch {
      setError("Could not load the document library.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const sortedDocuments = useMemo(
    () => documents.slice().sort((a, b) => a.title.localeCompare(b.title)),
    [documents],
  );

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    if (!title.trim() || !file) return;
    const problem = pdfUploadProblem(file);
    if (problem) {
      setUploadError(problem);
      return;
    }
    setUploading(true);
    setUploadError(null);
    setNote(null);
    try {
      const result = await uploadDocument({
        title: title.trim(),
        description: description.trim() || undefined,
        file,
      });
      setNote(
        "pending" in result
          ? "Submitted for a co-president to approve."
          : "Uploaded.",
      );
      setTitle("");
      setDescription("");
      setFile(null);
      form.reset();
      await load();
    } catch (err) {
      setUploadError(
        (err instanceof ApiError && err.detail) ||
          "Could not upload that file. Check it is a PDF under 15MB.",
      );
    } finally {
      setUploading(false);
    }
  };

  if (!user?.isExecutive) {
    return (
      <div className="mx-auto w-full max-w-[1060px] px-5 py-8">
        <Note>Only signed-in execs can see the document library.</Note>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1060px] flex-col gap-6 px-5 py-8">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Documents</h1>
        <p className="mt-1 text-subtle">
          Bylaws, banking resolutions, director confirmations and their signing
          requests.
        </p>
        {!user.isApprover && (
          <p className="mt-1 text-xs text-subtle">
            You can upload and start signing requests, but a co-president has to
            approve them before they take effect. Viewing is unrestricted.
          </p>
        )}
      </div>

      {user.isApprover && <PendingApprovals onChanged={load} />}
      {!user.isApprover && <MySubmissions />}

      <Panel
        action={
          <div className="flex items-center gap-3">
            <Link
              className="text-xs font-bold text-brand underline underline-offset-4"
              href="/admin/documents/templates/help"
            >
              How to use templates
            </Link>
            <Button asChild size="sm" variant="secondary">
              <Link href="/admin/documents/templates">Download a template</Link>
            </Button>
          </div>
        }
        title="Add a document"
      >
        <form className="flex flex-col gap-4" onSubmit={upload}>
          <div>
            <label className={labelClass} htmlFor="title">
              Title
            </label>
            <input
              className={field}
              id="title"
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 2025 Banking Resolution"
              value={title}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="description">
              Description (optional)
            </label>
            <textarea
              className={`${field} min-h-[70px]`}
              id="description"
              onChange={(e) => setDescription(e.target.value)}
              value={description}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="file">
              File (PDF only, up to 15MB)
            </label>
            <input
              accept="application/pdf"
              aria-describedby="file-help"
              className={field}
              id="file"
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null;
                setFile(picked);
                setNote(null);
                setUploadError(picked && pdfUploadProblem(picked));
              }}
              type="file"
            />
            <p className="mt-1 text-xs text-subtle" id="file-help">
              Made it in Word or Google Docs? Export or save it as a PDF first.
            </p>
          </div>

          {uploadError && (
            <p className="text-sm font-bold text-destructive" role="alert">
              {uploadError}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button
              disabled={
                uploading || !title.trim() || !file || !!pdfUploadProblem(file)
              }
              type="submit"
              variant="primary"
            >
              {uploading ? "Uploading..." : "Upload"}
            </Button>
            {note && (
              <span className="text-sm font-bold text-brand">{note}</span>
            )}
          </div>
        </form>
      </Panel>

      {error && <p className="text-sm font-bold text-destructive">{error}</p>}

      {loading ? (
        <p className="font-bold text-subtle">Loading...</p>
      ) : (
        !!sortedDocuments.length && (
          <Panel title="Library">
            <ul className="flex flex-col gap-2">
              {sortedDocuments.map((doc) => (
                <li key={doc.$key}>
                  <Link
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border-2 border-line bg-surface p-3 hover:bg-tint"
                    href={`/admin/documents/${doc.$key}`}
                  >
                    <span className="font-bold text-ink">{doc.title}</span>
                    <Pill>
                      {doc.currentVersionId
                        ? "Has a version"
                        : "No version yet"}
                    </Pill>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )
      )}
      {!loading && !documents.length && (
        <Note>No documents yet. Add the first one above.</Note>
      )}
    </div>
  );
}
