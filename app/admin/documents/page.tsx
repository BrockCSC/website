"use client";

import { Check, Download, Plus, Share, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DocumentThumbnail } from "@/components/documents/document-thumbnail";
import { BottomToolbar } from "@/components/ui/bottom-toolbar";
import { Button } from "@/components/ui/button";
import { Fab } from "@/components/ui/fab";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { announce } from "@/lib/announce";
import { ApiError } from "@/lib/api/client";
import {
  documentFileUrl,
  fetchDocuments,
  fetchMyPendingActions,
  fetchPendingActions,
  pendingFileUrl,
  reviewPendingAction,
  uploadDocument,
  type DocumentItem,
  type PendingActionItem,
} from "@/lib/api/documents";
import { formatSigningTime } from "@/lib/documents/signing-time";
import { pdfUploadProblem } from "@/lib/documents/upload-check";
import { useCloseWatcher } from "@/lib/use-close-watcher";
import { usePhone } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { ask } from "../ask";
import { useTopBar } from "../chrome";
import { AdminPage } from "../page-frame";
import { useSession } from "../session";
import { Note, Panel, Pill, field, labelClass } from "../users/ui";

const describePendingKind = (kind: PendingActionItem["kind"]) =>
  ({
    upload: "Upload a new document",
    replace: "Upload a new version",
    delete: "Delete a document",
    rename: "Rename a document",
    "start-signing": "Start a signing request",
    "add-signer": "Add a signer",
    "remove-signer": "Remove a signer",
    "cancel-signing": "Cancel a signing request",
  })[kind];

const topAction =
  "press-flat min-h-11 rounded-[10px] px-2 font-bold whitespace-nowrap text-ink";

function RenameSummary({
  target,
}: {
  target: NonNullable<PendingActionItem["target"]>;
}) {
  const { documentTitle, newTitle, newDescription } = target;
  return (
    <>
      <p className="wrap-anywhere">
        {documentTitle && documentTitle !== newTitle
          ? `Rename “${documentTitle}” to “${newTitle}”`
          : `Title: “${newTitle}”`}
      </p>
      {newDescription === null && <p>Clear the description</p>}
      {newDescription && (
        <p className="wrap-anywhere">Description: {newDescription}</p>
      )}
    </>
  );
}

function PendingTarget({ item }: { item: PendingActionItem }) {
  if (!item.target) return null;
  return (
    <>
      {item.kind === "rename" ? (
        <RenameSummary target={item.target} />
      ) : (
        item.target.documentTitle && <p>{item.target.documentTitle}</p>
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
        <p>Signers: {item.target.signers.map((s) => s.name).join(", ")}</p>
      )}
      {item.target.note && <p>Note: {item.target.note}</p>}
    </>
  );
}

/** Approve at once; Reject asks for an optional reason first (docs-7). */
function usePendingApprovals(
  onChanged: () => void,
  phone: boolean,
  enabled: boolean,
) {
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
    if (!enabled) return;
    void (async () => {
      await load();
    })();
  }, [load, enabled]);

  const review = async (
    item: PendingActionItem,
    action: "approve" | "reject",
  ) => {
    let reason: string | undefined;
    if (action === "reject") {
      const answer = await ask({
        title: "Reject this?",
        detail: [describePendingKind(item.kind), item.target?.documentTitle]
          .filter(Boolean)
          .join(": "),
        withInput: true,
        placeholder: "Reason (optional)",
        confirmLabel: "Reject",
        destructive: true,
      });
      if (answer === null) return;
      reason = answer.trim() || undefined;
    }
    setBusy(item.$key);
    setError(null);
    try {
      await reviewPendingAction(item.$key, action, reason);
      await load();
      onChanged();
      if (phone)
        toast({ message: action === "approve" ? "Approved" : "Rejected" });
    } catch (err) {
      const message =
        (err instanceof ApiError && err.detail) || "Could not review that.";
      setError(message);
      if (phone) toast({ message, tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  return { pending, loading, busy, error, review };
}

type Approvals = ReturnType<typeof usePendingApprovals>;

function PendingApprovals({ approvals }: { approvals: Approvals }) {
  const { pending, loading, busy, error, review } = approvals;
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
                  <PendingTarget item={item} />
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
                onClick={() => void review(item, "approve")}
                size="sm"
                type="button"
                variant="primary"
              >
                Approve
              </Button>
              <Button
                disabled={busy === item.$key}
                onClick={() => void review(item, "reject")}
                size="sm"
                type="button"
                variant="outline-destructive"
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

/**
 * Phones: approvals sit in flow below the library (spec §3.7 step 2), so
 * Reject's ask is the only dialog. The dashboard's Needs-you row links to
 * #approvals, which opens it.
 */
function PhoneApprovals({ approvals }: { approvals: Approvals }) {
  const { pending, loading, busy, review } = approvals;
  const ref = useRef<HTMLDetailsElement>(null);
  const shown = !loading && pending.length > 0;

  useEffect(() => {
    if (!shown) return;
    const openFromHash = () => {
      if (window.location.hash !== "#approvals" || !ref.current) return;
      ref.current.open = true;
      ref.current.scrollIntoView({ block: "start" });
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [shown]);

  if (!shown) return null;

  return (
    <details
      className="group rounded-[16px] border-2 border-line bg-surface"
      id="approvals"
      ref={ref}
    >
      <summary className="press-flat flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-[14px] px-4 font-bold text-ink [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          {pending.length} waiting for approval
        </span>
        <span
          aria-hidden
          className="min-w-6 rounded-full border-2 border-line bg-ink px-1.5 text-center text-xs leading-5 font-bold text-surface"
        >
          {pending.length}
        </span>
        <span
          aria-hidden
          className="text-subtle transition-transform group-open:rotate-90"
        >
          ›
        </span>
      </summary>
      <div className="border-t-2 border-line/15 px-4 pt-2 pb-4">
        <p className="text-sm text-subtle">
          Actions from execs who aren&apos;t co-presidents wait here until
          approved.
        </p>
        <ul className="mt-3 flex flex-col gap-3">
          {pending.map((item) => (
            <li
              className="rounded-[14px] border-2 border-line bg-surface p-3"
              key={item.$key}
            >
              <p className="font-bold text-ink">
                {describePendingKind(item.kind)}
              </p>
              <p className="text-sm text-subtle">
                {item.proposedByName || item.proposedBy} ·{" "}
                {formatSigningTime(item.proposedAt)}
              </p>
              {item.target && (
                <div className="mt-1 text-sm text-ink">
                  <PendingTarget item={item} />
                </div>
              )}
              {(item.kind === "upload" || item.kind === "replace") && (
                <a
                  className="inline-flex min-h-11 items-center text-sm font-bold text-ink underline underline-offset-4"
                  href={pendingFileUrl(item.$key)}
                  rel="noreferrer"
                  target="_blank"
                >
                  Preview file
                </a>
              )}
              <div className="mt-3 grid w-full grid-cols-2 gap-3">
                <Button
                  className="h-11"
                  disabled={busy === item.$key}
                  onClick={() => void review(item, "approve")}
                  type="button"
                  variant="primary"
                >
                  Approve
                </Button>
                <Button
                  className="h-11"
                  disabled={busy === item.$key}
                  onClick={() => void review(item, "reject")}
                  type="button"
                  variant="outline-destructive"
                >
                  Reject
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </details>
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
            {item.kind === "rename" && item.target ? (
              <div className="text-xs text-subtle max-md:text-sm">
                <RenameSummary target={item.target} />
              </div>
            ) : (
              item.target?.documentTitle && (
                <p className="text-xs text-subtle max-md:text-sm">
                  {item.target.documentTitle}
                </p>
              )
            )}
            {item.status === "rejected" && item.rejectionReason && (
              <p className="mt-1 text-xs font-bold text-destructive max-md:text-sm">
                Rejected: {item.rejectionReason}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** The add-a-document form: inline on desk, in a sheet on phones. */
function useUploadForm(onUploaded: (message: string) => void) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

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
      const message =
        "pending" in result
          ? "Submitted for a co-president to approve."
          : "Uploaded.";
      setNote(message);
      setTitle("");
      setDescription("");
      setFile(null);
      form.reset();
      onUploaded(message);
    } catch (err) {
      setUploadError(
        (err instanceof ApiError && err.detail) ||
          "Could not upload that file. Check it is a PDF under 15MB.",
      );
    } finally {
      setUploading(false);
    }
  };

  const canSubmit =
    !uploading && !!title.trim() && !!file && !pdfUploadProblem(file);

  const fields = (
    <>
      <div>
        <label className={labelClass} htmlFor="title">
          Title
        </label>
        <input
          autoCapitalize="sentences"
          className={field}
          enterKeyHint="next"
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
        <p className="mt-1 text-xs text-subtle max-md:text-sm" id="file-help">
          Made it in Word or Google Docs? Export or save it as a PDF first.
        </p>
      </div>

      {uploadError && (
        <p className="text-sm font-bold text-destructive" role="alert">
          {uploadError}
        </p>
      )}
    </>
  );

  return { upload, uploading, canSubmit, note, fields };
}

function SkeletonRows() {
  return (
    <ul
      aria-busy="true"
      aria-label="Loading documents"
      className="flex flex-col gap-2"
    >
      {[0, 1, 2, 3].map((i) => (
        <li
          className="flex items-center gap-3 rounded-[14px] border-2 border-line/30 p-2"
          key={i}
        >
          <span className="h-[52px] w-10 shrink-0 animate-pulse rounded-[6px] bg-raised" />
          <span className="h-4 w-2/3 animate-pulse rounded-full bg-raised" />
        </li>
      ))}
    </ul>
  );
}

function LoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border-2 border-line bg-tint p-4"
      role="alert"
    >
      <p className="font-bold text-ink">{message}</p>
      <Button
        className="min-h-11"
        onClick={onRetry}
        type="button"
        variant="secondary"
      >
        Try again
      </Button>
    </div>
  );
}

const canShareFiles = () => {
  try {
    return (
      typeof navigator.canShare === "function" &&
      navigator.canShare({
        files: [new File([""], "x.pdf", { type: "application/pdf" })],
      })
    );
  } catch {
    return false;
  }
};

const downloadAll = async (docs: DocumentItem[]) => {
  for (const doc of docs) {
    const link = document.createElement("a");
    link.href = documentFileUrl(doc.currentVersionId!);
    link.download = `${doc.title}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Browsers throttle several downloads fired in the same tick.
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
};

export default function DocumentsPage() {
  const { user } = useSession();
  const phone = usePhone();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

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

  const retry = () => {
    setLoading(true);
    setError(null);
    void load();
  };

  const approvals = usePendingApprovals(load, phone, !!user?.isApprover);

  const uploadForm = useUploadForm((message) => {
    void load();
    if (phone) {
      setUploadOpen(false);
      toast({ message });
    }
  });

  const sortedDocuments = useMemo(
    () => documents.slice().sort((a, b) => a.title.localeCompare(b.title)),
    [documents],
  );

  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const toggleChecked = (key: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  const downloadable = sortedDocuments.filter((doc) => doc.currentVersionId);
  const allChecked = checked.size > 0 && checked.size === downloadable.length;
  const picked = downloadable.filter((doc) => checked.has(doc.$key));

  const downloadSelected = () => downloadAll(picked);

  // Phone selection mode (spec D14): entered from the top bar's Select, not
  // in history; Android back leaves it.
  const [selectMode, setSelectMode] = useState(false);
  const selecting = phone && selectMode;
  const [shareable, setShareable] = useState(false);
  const [prepared, setPrepared] = useState<{
    key: string;
    files: File[];
  } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const pickedKey = picked.map((doc) => doc.$key).join(",");

  const enterSelection = () => {
    setChecked(new Set());
    setPrepared(null);
    setShareable(canShareFiles());
    setSelectMode(true);
    announce(
      "Selection mode. Tap documents to select them. Actions are in the toolbar at the bottom.",
    );
  };
  const exitSelection = () => {
    setSelectMode(false);
    setChecked(new Set());
    setPrepared(null);
  };
  useCloseWatcher(selecting, exitSelection);

  const prepare = async () => {
    setPreparing(true);
    try {
      const files = await Promise.all(
        picked.map(async (doc) => {
          const res = await fetch(documentFileUrl(doc.currentVersionId!), {
            credentials: "same-origin",
          });
          if (!res.ok) throw new Error("fetch failed");
          const blob = await res.blob();
          const type = blob.type || "application/pdf";
          const ext = type === "application/pdf" ? "pdf" : type.split("/")[1];
          return new File([blob], `${doc.title}.${ext}`, { type });
        }),
      );
      setPrepared({ key: pickedKey, files });
    } catch {
      toast({ message: "Could not prepare those files.", tone: "error" });
    } finally {
      setPreparing(false);
    }
  };

  const share = async (files: File[]) => {
    try {
      await navigator.share({ files });
      exitSelection();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast({ message: "Could not share those files.", tone: "error" });
    }
  };

  const ready = prepared?.key === pickedKey ? prepared.files : null;
  const count = picked.length;
  const primary = !shareable
    ? {
        key: "download",
        label: count ? `Download ${count}` : "Download",
        icon: Download,
        onPress: () => void downloadSelected().then(exitSelection),
      }
    : ready
      ? {
          key: "share",
          label: `Share ${count}`,
          icon: Share,
          onPress: () => void share(ready),
        }
      : {
          key: "prepare",
          label: preparing
            ? "Preparing…"
            : `Prepare ${count} file${count === 1 ? "" : "s"}`,
          icon: Share,
          onPress: () => void prepare(),
        };

  useTopBar(
    {
      actions:
        downloadable.length > 0 ? (
          <button className={topAction} onClick={enterSelection} type="button">
            Select
          </button>
        ) : undefined,
    },
    { active: phone && user?.isExecutive === true },
  );
  useTopBar(
    {
      back: { label: "Cancel", onBack: exitSelection, chevron: false },
      title: (
        <span aria-atomic="true" aria-live="polite">
          {checked.size} selected
        </span>
      ),
      hideSearch: true,
      actions: (
        <button
          className={topAction}
          onClick={() =>
            setChecked(
              allChecked
                ? new Set()
                : new Set(downloadable.map((doc) => doc.$key)),
            )
          }
          type="button"
        >
          {allChecked ? "Deselect all" : "Select all"}
        </button>
      ),
    },
    { active: selecting },
  );

  if (!user?.isExecutive) {
    return (
      <AdminPage>
        <Note>Only signed-in execs can see the document library.</Note>
      </AdminPage>
    );
  }

  const intro = (
    <div>
      <h1 className="text-2xl font-extrabold text-ink">Documents</h1>
      <p className="mt-1 text-subtle">
        Bylaws, banking resolutions, director confirmations and their signing
        requests.
      </p>
      {!user.isApprover && (
        <p className="mt-1 text-xs text-subtle max-md:text-sm">
          You can upload and start signing requests, but a co-president has to
          approve them before they take effect. Viewing is unrestricted.
        </p>
      )}
    </div>
  );

  if (phone) {
    return (
      <AdminPage className="flex flex-col gap-6 pb-24">
        {intro}

        {error && <LoadError message={error} onRetry={retry} />}

        {loading ? (
          <SkeletonRows />
        ) : sortedDocuments.length ? (
          <ul
            aria-label="Library"
            className="divide-y-2 divide-line/15 overflow-hidden rounded-[16px] border-2 border-line bg-surface"
          >
            {sortedDocuments.map((doc) => {
              const on = checked.has(doc.$key);
              const body = (
                <>
                  <DocumentThumbnail versionId={doc.currentVersionId} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="line-clamp-2 font-bold wrap-anywhere text-ink">
                      {doc.title}
                    </span>
                    {!doc.currentVersionId && (
                      <span className="text-sm text-subtle">
                        No version yet
                      </span>
                    )}
                  </span>
                </>
              );
              if (!selecting) {
                return (
                  <li key={doc.$key}>
                    <Link
                      className="press-flat flex min-h-16 items-center gap-3 px-3 py-2"
                      href={`/admin/documents/${doc.$key}`}
                    >
                      {body}
                      <span aria-hidden className="text-lg text-subtle">
                        ›
                      </span>
                    </Link>
                  </li>
                );
              }
              if (!doc.currentVersionId) {
                return (
                  <li
                    className="flex min-h-16 items-center gap-3 px-3 py-2 opacity-50"
                    key={doc.$key}
                  >
                    <span className="size-11 shrink-0" />
                    {body}
                  </li>
                );
              }
              return (
                <li key={doc.$key}>
                  <label
                    className={cn(
                      "press-flat flex min-h-16 cursor-pointer items-center gap-3 px-3 py-2",
                      on && "bg-tint",
                    )}
                  >
                    <span className="grid size-11 shrink-0 place-items-center">
                      <input
                        aria-label={`Select ${doc.title}`}
                        checked={on}
                        className="peer sr-only"
                        onChange={(e) =>
                          toggleChecked(doc.$key, e.target.checked)
                        }
                        type="checkbox"
                      />
                      <span
                        aria-hidden
                        className={cn(
                          "grid size-6 place-items-center rounded-full border-2 border-line peer-focus-visible:outline-3 peer-focus-visible:outline-brand",
                          on ? "bg-ink text-surface" : "bg-surface",
                        )}
                      >
                        {on && <Check className="size-4" strokeWidth={3} />}
                      </span>
                    </span>
                    {body}
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          !error && <Note>No documents yet. Tap + to add the first one.</Note>
        )}

        {user.isApprover && <PhoneApprovals approvals={approvals} />}
        {!user.isApprover && <MySubmissions />}

        <Fab
          extended
          hidden={selecting}
          icon={Plus}
          label="Upload"
          onPress={() => setUploadOpen(true)}
        />

        <Sheet
          footer={
            <Button
              className="h-12 w-full"
              disabled={!uploadForm.canSubmit}
              form="upload-form"
              type="submit"
              variant="primary"
            >
              {uploadForm.uploading ? "Uploading..." : "Upload"}
            </Button>
          }
          onClose={() => {
            if (!uploadForm.uploading) setUploadOpen(false);
          }}
          open={uploadOpen}
          title="Add a document"
        >
          <form
            className="flex flex-col gap-4"
            id="upload-form"
            onSubmit={uploadForm.upload}
          >
            {uploadForm.fields}
          </form>
          <div className="mt-5 flex flex-col divide-y-2 divide-line/15 rounded-[16px] border-2 border-line">
            <Link
              className="press-flat flex min-h-12 items-center justify-between gap-3 rounded-t-[14px] px-4 font-bold text-ink"
              href="/admin/documents/templates"
              onClick={() => setUploadOpen(false)}
            >
              Download a template
              <span aria-hidden className="text-subtle">
                ›
              </span>
            </Link>
            <Link
              className="press-flat flex min-h-12 items-center justify-between gap-3 rounded-b-[14px] px-4 font-bold text-ink"
              href="/admin/documents/templates/help"
              onClick={() => setUploadOpen(false)}
            >
              How to use templates
              <span aria-hidden className="text-subtle">
                ›
              </span>
            </Link>
          </div>
        </Sheet>

        {selecting && (
          <BottomToolbar
            items={[
              {
                key: "clear",
                label: "Clear",
                icon: X,
                disabled: checked.size === 0,
                onPress: () => setChecked(new Set()),
              },
              {
                ...primary,
                primary: true,
                disabled: count === 0 || preparing,
              },
            ]}
            label="Selection actions"
          />
        )}
      </AdminPage>
    );
  }

  return (
    <AdminPage className="flex flex-col gap-6">
      {intro}

      {user.isApprover && <PendingApprovals approvals={approvals} />}
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
        <form className="flex flex-col gap-4" onSubmit={uploadForm.upload}>
          {uploadForm.fields}

          <div className="flex items-center gap-3">
            <Button
              disabled={!uploadForm.canSubmit}
              type="submit"
              variant="primary"
            >
              {uploadForm.uploading ? "Uploading..." : "Upload"}
            </Button>
            {uploadForm.note && (
              <span className="text-sm font-bold text-brand">
                {uploadForm.note}
              </span>
            )}
          </div>
        </form>
      </Panel>

      {error && <LoadError message={error} onRetry={retry} />}

      {loading ? (
        <SkeletonRows />
      ) : (
        !!sortedDocuments.length && (
          <Panel
            action={
              checked.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-subtle">
                    {checked.size} selected
                  </span>
                  <Button
                    onClick={() => void downloadSelected()}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    Download selected
                  </Button>
                  <Button
                    onClick={() => setChecked(new Set())}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Clear
                  </Button>
                </div>
              )
            }
            title="Library"
          >
            {downloadable.length > 0 && (
              <label className="mb-2 flex w-fit items-center gap-2 text-xs font-bold text-subtle">
                <input
                  checked={allChecked}
                  className="size-4 accent-brand"
                  onChange={(e) =>
                    setChecked(
                      e.target.checked
                        ? new Set(downloadable.map((doc) => doc.$key))
                        : new Set(),
                    )
                  }
                  type="checkbox"
                />
                Select all
              </label>
            )}
            <ul className="flex flex-col gap-2">
              {sortedDocuments.map((doc) => (
                <li
                  className="flex items-center gap-2 rounded-[14px] border-2 border-line bg-surface p-2 pr-3 hover:bg-tint"
                  key={doc.$key}
                >
                  {doc.currentVersionId && (
                    <label className="-m-2 flex shrink-0 cursor-pointer p-2">
                      <input
                        aria-label={`Select ${doc.title}`}
                        checked={checked.has(doc.$key)}
                        className="ml-1 size-4 shrink-0 accent-brand"
                        onChange={(e) =>
                          toggleChecked(doc.$key, e.target.checked)
                        }
                        type="checkbox"
                      />
                    </label>
                  )}
                  <Link
                    className="flex min-w-0 flex-1 items-center gap-3"
                    href={`/admin/documents/${doc.$key}`}
                  >
                    <DocumentThumbnail versionId={doc.currentVersionId} />
                    <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 break-words font-bold text-ink">
                        {doc.title}
                      </span>
                      <Pill>
                        {doc.currentVersionId
                          ? "Has a version"
                          : "No version yet"}
                      </Pill>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )
      )}
      {!loading && !error && !documents.length && (
        <Note>No documents yet. Add the first one above.</Note>
      )}
    </AdminPage>
  );
}
