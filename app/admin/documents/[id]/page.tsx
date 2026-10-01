"use client";

import {
  ChevronRight,
  Ellipsis,
  FilePlus2,
  History,
  PencilLine,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DocumentPreview } from "@/components/documents/document-preview";
import {
  DocumentViewer,
  type ViewerFile,
} from "@/components/documents/document-viewer";
import {
  FieldFootprint,
  FieldHitTarget,
  PlaceableField,
} from "@/components/documents/field-chip";
import {
  AddFieldControl,
  CompactPlacementBar,
  FieldLegend,
  FieldTypePicker,
  SelectedFieldStrip,
  SignerPicker,
  SignerSwatch,
  type PlacementSigner,
} from "@/components/documents/placement-tools";
import {
  SigningProgressBar,
  signingProgress,
} from "@/components/documents/signer-activity";
import { ActionSheet } from "@/components/ui/action-sheet";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { ApiError } from "@/lib/api/client";
import type {
  SignerInput,
  SigningFieldInput,
  SigningFieldType,
} from "@/lib/api/types";
import {
  addDocumentVersion,
  deleteDocument,
  documentFileUrl,
  fetchDocumentDetail,
  fetchMemberOptions,
  renameDocument,
  startSigningRequest,
  type DocumentItem,
  type DocumentVersionItem,
  type MemberOption,
  type SigningRequestItem,
} from "@/lib/api/documents";
import {
  MAX_SIGNERS,
  SIGNING_FIELD_DEFAULT_LABEL,
} from "@/lib/documents/fields";
import { signerColor } from "@/lib/documents/signer-colors";
import { formatSigningTime } from "@/lib/documents/signing-time";
import { pdfUploadProblem } from "@/lib/documents/upload-check";
import { useCloseWatcher } from "@/lib/use-close-watcher";
import { PHONE_QUERY, useCoarsePointer, usePhone } from "@/lib/use-media-query";
import { useStackParam } from "@/lib/use-stack-param";
import { cn } from "@/lib/utils";
import { useSession } from "../../session";
import { ask } from "../../ask";
import { useTopBar } from "../../chrome";
import { AdminPage } from "../../page-frame";
import { Note, Panel, Pill, field, labelClass } from "../../users/ui";

type SignerDraft =
  | { localId: string; kind: "member"; signupId: string }
  | { localId: string; kind: "external"; name: string; email: string };

type FieldDraft = {
  id: string;
  type: SigningFieldType;
  page: number;
  xPercent: number;
  yPercent: number;
  signerId: string;
  required: boolean;
};

const clamp = (n: number) => Math.min(100, Math.max(0, n));

const sectionTitle =
  "mb-2 text-sm font-extrabold tracking-wide text-ink uppercase";

function versionBadge(
  v: DocumentVersionItem,
  document: DocumentItem,
  signingRequests: SigningRequestItem[],
) {
  return (
    <>
      {v.producedBySigningRequestId && (
        <Pill tone="accent">
          {signingRequests.some((r) => r.certificateVersionId === v.$key)
            ? "Certificate of Completion"
            : v.contentType === "application/pdf"
              ? "Signed"
              : "Signing certificate"}
        </Pill>
      )}
      {document.currentVersionId === v.$key && (
        <Pill tone="accent">Current</Pill>
      )}
    </>
  );
}

/** Phones: the description clamped to two lines, with More. */
function Description({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const observer = new ResizeObserver(() =>
      setClamped(el.scrollHeight > el.clientHeight + 1),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, text]);

  return (
    <div>
      <p
        className={cn(
          "text-base text-ink wrap-anywhere",
          !expanded && "line-clamp-2",
        )}
        ref={ref}
      >
        {text}
      </p>
      {clamped && !expanded && (
        <button
          className="press-flat -ml-2 min-h-11 rounded-[10px] px-2 font-bold text-ink"
          onClick={() => setExpanded(true)}
          type="button"
        >
          More
        </button>
      )}
    </div>
  );
}

/** Phones: the in-progress request first, as a card linking to it. */
function ActiveRequestCard({ request }: { request: SigningRequestItem }) {
  const { signed, total, waitingOn } = signingProgress(request);
  return (
    <Link
      className="press flex items-center gap-3 rounded-[16px] border-2 border-line bg-surface p-4 shadow-brut-sm"
      href={`/admin/documents/signing/${request.$key}`}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-sm font-bold text-subtle">
          Signing in progress
        </span>
        <span className="line-clamp-2 font-bold text-ink">{request.title}</span>
        <span className="text-base text-ink">
          {signed} of {total} signed
          {waitingOn && (
            <span className="text-subtle"> · waiting on {waitingOn}</span>
          )}
        </span>
        <SigningProgressBar signed={signed} total={total} />
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-subtle" />
    </Link>
  );
}

export default function DocumentDetailPage() {
  const id = useParams().id as string;
  const router = useRouter();
  const { user } = useSession();
  const phone = usePhone();
  const coarse = useCoarsePointer();
  const view = useStackParam("view", { push: PHONE_QUERY });
  const [document, setDocument] = useState<DocumentItem | null>(null);
  const [versions, setVersions] = useState<DocumentVersionItem[]>([]);
  const [signingRequests, setSigningRequests] = useState<SigningRequestItem[]>(
    [],
  );
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [renaming, setRenaming] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameDescription, setRenameDescription] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [savingRename, setSavingRename] = useState(false);
  const renameButton = useRef<HTMLButtonElement>(null);
  const refocusRename = useRef(false);
  const renameInput = useRef<HTMLInputElement>(null);

  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [replaceNote, setReplaceNote] = useState("");
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [signingTitle, setSigningTitle] = useState("");
  const [mode, setMode] = useState<"ordered" | "parallel">("parallel");
  const [signers, setSigners] = useState<SignerDraft[]>([]);
  const [starting, setStarting] = useState(false);

  const [fieldType, setFieldType] = useState<SigningFieldType>("signature");
  const [activeSignerId, setActiveSignerId] = useState<string | null>(null);
  const [placedFields, setPlacedFields] = useState<FieldDraft[]>([]);

  // Phones: the ⋯ sheet, the new-version sheet and the versions disclosure.
  const [actionsOpen, setActionsOpen] = useState(false);
  const [versionSheet, setVersionSheet] = useState(false);
  const versionsRef = useRef<HTMLDetailsElement>(null);

  // Coarse pointers: placement is armed only through "Add field", and a
  // placed field is edited from the bottom strip once selected.
  const [armed, setArmed] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const detail = await fetchDocumentDetail(id);
      setDocument(detail.document);
      setVersions(detail.versions);
      setSigningRequests(detail.signingRequests);
      setError(null);
    } catch {
      setError("Could not load this document.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
    void fetchMemberOptions()
      .then(setMembers)
      .catch(() => {});
  }, [load]);

  useEffect(() => {
    if (renaming || !refocusRename.current) return;
    refocusRename.current = false;
    renameButton.current?.focus();
  }, [renaming]);

  /** Desk keeps its inline note; phones get a toast. */
  const report = (message: string) => {
    if (phone) toast({ message });
    else setNote(message);
  };

  const openRename = () => {
    if (!document) return;
    setRenameTitle(document.title);
    setRenameDescription(document.description ?? "");
    setRenameError(null);
    setRenaming(true);
  };

  const closeRename = () => {
    refocusRename.current = !phone;
    setRenaming(false);
  };

  const saveRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!document || savingRename) return;
    const title = renameTitle.trim();
    const description = renameDescription.trim();
    if (!title) return;
    const descriptionChanged = description !== (document.description ?? "");
    if (title === document.title && !descriptionChanged) {
      closeRename();
      return;
    }
    setSavingRename(true);
    setRenameError(null);
    setNote(null);
    try {
      const result = await renameDocument(id, {
        title,
        description: descriptionChanged ? description : undefined,
      });
      if ("pending" in result) {
        report("Submitted for a co-president to approve.");
      } else {
        setDocument(result);
        report("Renamed.");
      }
      closeRename();
    } catch (err) {
      setRenameError(
        (err instanceof ApiError && err.detail) ||
          "Could not rename this document.",
      );
    } finally {
      setSavingRename(false);
    }
  };

  const replace = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    if (!replaceFile) return;
    const problem = pdfUploadProblem(replaceFile);
    if (problem) {
      setReplaceError(problem);
      return;
    }
    setUploading(true);
    setReplaceError(null);
    setNote(null);
    try {
      const result = await addDocumentVersion(
        id,
        replaceFile,
        replaceNote.trim() || undefined,
      );
      setReplaceFile(null);
      setReplaceNote("");
      form.reset();
      setVersionSheet(false);
      report(
        "pending" in result
          ? "Submitted for a co-president to approve."
          : "Uploaded.",
      );
      await load();
    } catch (err) {
      setReplaceError(
        (err instanceof ApiError && err.detail) ||
          "Could not upload that version. Check it is a PDF under 15MB.",
      );
    } finally {
      setUploading(false);
    }
  };

  const removeDocument = async () => {
    const confirmed = await ask({
      title: "Delete this document?",
      detail: "Every version is removed. This cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (confirmed === null) return;
    try {
      const result = await deleteDocument(id);
      if (result.pending) {
        report("Submitted for a co-president to approve.");
      } else {
        router.push("/admin/documents");
      }
    } catch (err) {
      const message =
        (err instanceof ApiError && err.detail) ||
        "Could not delete this document.";
      if (phone) toast({ message, tone: "error" });
      else setError(message);
    }
  };

  const showVersions = () => {
    // After the action sheet has closed and released the scroll lock.
    setTimeout(() => {
      const details = versionsRef.current;
      if (!details) return;
      details.open = true;
      details.scrollIntoView({ block: "start" });
      details.querySelector("summary")?.focus({ preventScroll: true });
    }, 250);
  };

  const addMemberSigner = (signupId: string) => {
    if (
      !signupId ||
      signers.some((s) => s.kind === "member" && s.signupId === signupId)
    )
      return;
    const localId = crypto.randomUUID();
    setSigners((s) => [...s, { localId, kind: "member", signupId }]);
    setActiveSignerId((current) => current ?? localId);
  };

  const addExternalSigner = () => {
    const localId = crypto.randomUUID();
    setSigners((s) => [
      ...s,
      { localId, kind: "external", name: "", email: "" },
    ]);
    setActiveSignerId((current) => current ?? localId);
  };

  const updateExternal = (
    localId: string,
    patch: Partial<{ name: string; email: string }>,
  ) =>
    setSigners((s) =>
      s.map((signer) =>
        signer.localId === localId && signer.kind === "external"
          ? { ...signer, ...patch }
          : signer,
      ),
    );

  const chooseSigner = (localId: string) => {
    setActiveSignerId(localId);
    setFieldType("signature");
  };

  const removeDraftSigner = (localId: string) => {
    const remaining = signers.filter((signer) => signer.localId !== localId);
    setSigners(remaining);
    setPlacedFields((prev) => prev.filter((f) => f.signerId !== localId));
    if (activeSignerId === localId) {
      setActiveSignerId(remaining[0]?.localId ?? null);
      setFieldType("signature");
    }
  };

  const signerLabel = (localId: string) => {
    const index = signers.findIndex((s) => s.localId === localId);
    const signer = signers[index];
    if (!signer) return "Signer";
    return (
      (signer.kind === "member"
        ? members.find((m) => m.id === signer.signupId)?.name
        : signer.name.trim()) || `Signer ${index + 1}`
    );
  };

  const placementSigners: PlacementSigner[] = signers.map((s, index) => ({
    id: s.localId,
    label: signerLabel(s.localId),
    color: signerColor(index),
  }));

  const isArmed = armed && !!activeSignerId;
  const disarm = () => setArmed(false);
  useCloseWatcher(isArmed, disarm);
  const arm = () => {
    setSelectedFieldId(null);
    setArmed(true);
  };

  const deleteField = (id: string) => {
    setPlacedFields((prev) => prev.filter((f) => f.id !== id));
    setSelectedFieldId((current) => (current === id ? null : current));
  };

  const addField = (page: number, xPercent: number, yPercent: number) => {
    if (!activeSignerId) return;
    const newId = crypto.randomUUID();
    setPlacedFields((prev) => [
      ...prev,
      {
        id: newId,
        page,
        required: true,
        signerId: activeSignerId,
        type: fieldType,
        xPercent,
        yPercent,
      },
    ]);
    if (coarse) {
      setArmed(false);
      setSelectedFieldId(newId);
      toast({
        message: "Field added",
        action: { label: "Undo", onAction: () => deleteField(newId) },
      });
    }
  };

  const moveField = (id: string, xPercent: number, yPercent: number) =>
    setPlacedFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, xPercent, yPercent } : f)),
    );

  const nudgeField = (id: string, dx: number, dy: number) =>
    setPlacedFields((prev) =>
      prev.map((f) =>
        f.id === id
          ? {
              ...f,
              xPercent: clamp(f.xPercent + dx),
              yPercent: clamp(f.yPercent + dy),
            }
          : f,
      ),
    );

  const patchField = (id: string, patch: Partial<FieldDraft>) =>
    setPlacedFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    );

  const selectedField = coarse
    ? (placedFields.find((f) => f.id === selectedFieldId) ?? null)
    : null;

  const deleteSelected = () => {
    if (!selectedField) return;
    const removed = selectedField;
    deleteField(removed.id);
    toast({
      message: "Field deleted",
      action: {
        label: "Undo",
        onAction: () => setPlacedFields((prev) => [...prev, removed]),
      },
    });
  };

  const currentVersion = versions.find(
    (v) => v.$key === document?.currentVersionId,
  );
  const currentIsPdf = currentVersion?.contentType === "application/pdf";
  const activeRequest = signingRequests.find((r) => r.status === "sent");

  const startBlockers: string[] = [];
  if (activeRequest)
    startBlockers.push(
      "A signing request is already in progress for this document. Wait for it to finish or cancel it first.",
    );
  if (!currentVersion) startBlockers.push("Upload a PDF version first.");
  else if (!currentIsPdf)
    startBlockers.push(
      "The current version isn't a PDF. Upload the document again as a PDF.",
    );
  if (!signingTitle.trim()) startBlockers.push("Give the request a title.");
  if (!signers.length) startBlockers.push("Add at least one signer.");
  if (signers.length > MAX_SIGNERS)
    startBlockers.push(
      `A signing request can have at most ${MAX_SIGNERS} signers.`,
    );
  for (const signer of signers) {
    const label = signerLabel(signer.localId);
    if (
      signer.kind === "external" &&
      (!signer.name.trim() || !signer.email.trim())
    )
      startBlockers.push(`${label} needs a name and an email.`);
    if (
      !placedFields.some(
        (f) => f.signerId === signer.localId && f.type === "signature",
      )
    )
      startBlockers.push(`${label} needs a Signature field.`);
  }

  const startSigning = async (e: React.FormEvent) => {
    e.preventDefault();
    if (starting || startBlockers.length) return;
    setStarting(true);
    setError(null);
    setNote(null);
    try {
      const indexByLocalId = new Map(signers.map((s, i) => [s.localId, i]));
      const input: SignerInput[] = signers.map((s) =>
        s.kind === "member"
          ? { kind: "member", signupId: s.signupId }
          : { kind: "external", name: s.name, email: s.email },
      );
      const fieldsInput: SigningFieldInput[] = placedFields.map((f) => ({
        page: f.page,
        required: f.required,
        signerIndex: indexByLocalId.get(f.signerId)!,
        type: f.type,
        xPercent: f.xPercent,
        yPercent: f.yPercent,
      }));
      const result = await startSigningRequest(id, {
        title: signingTitle.trim(),
        mode,
        signers: input,
        fields: fieldsInput,
      });
      report(
        "pending" in result
          ? "Submitted for a co-president to approve."
          : "Signing request sent.",
      );
      setSigningTitle("");
      setSigners([]);
      setPlacedFields([]);
      setActiveSignerId(null);
      setSelectedFieldId(null);
      setArmed(false);
      await load();
    } catch (err) {
      const message =
        (err instanceof ApiError && err.detail) || "Could not start signing.";
      if (phone) toast({ message, tone: "error" });
      else setError(message);
    } finally {
      setStarting(false);
    }
  };

  const viewing = versions.find((v) => v.$key === view.value) ?? null;
  const viewerFile: ViewerFile | null = viewing
    ? {
        url: documentFileUrl(viewing.$key),
        name: viewing.originalFilename,
        contentType: viewing.contentType,
      }
    : null;

  useTopBar(
    {
      back: { label: "Documents", href: "/admin/documents" },
      title: document?.title ?? "Document",
      docTitle: document?.title,
      largeTitle: false,
      actions: document ? (
        <button
          aria-haspopup="dialog"
          aria-label="More actions"
          className="press-flat grid size-11 place-items-center rounded-[10px] text-ink"
          onClick={() => setActionsOpen(true)}
          type="button"
        >
          <Ellipsis aria-hidden className="size-5" strokeWidth={2.5} />
        </button>
      ) : undefined,
    },
    { active: user?.isExecutive === true },
  );

  if (!user?.isExecutive) {
    return (
      <AdminPage>
        <Note>Only signed-in execs can see documents.</Note>
      </AdminPage>
    );
  }
  if (loading) {
    return (
      <AdminPage>
        <p className="font-bold text-subtle">Loading...</p>
      </AdminPage>
    );
  }
  if (!document) {
    return (
      <AdminPage>
        {error ? (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border-2 border-line bg-tint p-4"
            role="alert"
          >
            <p className="font-bold text-ink">{error}</p>
            <Button
              className="min-h-11"
              onClick={() => {
                setLoading(true);
                void load();
              }}
              type="button"
              variant="secondary"
            >
              Try again
            </Button>
          </div>
        ) : (
          <Note>That document doesn&apos;t exist.</Note>
        )}
      </AdminPage>
    );
  }

  const renameFields = (
    <>
      <div>
        <label className={labelClass} htmlFor="rename-title">
          Title
        </label>
        <input
          autoFocus={!phone}
          className={field}
          enterKeyHint="done"
          id="rename-title"
          maxLength={200}
          onChange={(e) => setRenameTitle(e.target.value)}
          ref={renameInput}
          value={renameTitle}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="rename-description">
          Description (optional)
        </label>
        <textarea
          className={`${field} min-h-[70px]`}
          id="rename-description"
          maxLength={2000}
          onChange={(e) => setRenameDescription(e.target.value)}
          value={renameDescription}
        />
      </div>
      {renameError && (
        <p className="text-sm font-bold text-destructive" role="alert">
          {renameError}
        </p>
      )}
    </>
  );

  const replaceFields = (
    <>
      <div>
        <label className={labelClass} htmlFor="replace-file">
          Upload a new version
        </label>
        <input
          accept="application/pdf"
          aria-describedby="replace-file-help"
          className={field}
          id="replace-file"
          onChange={(e) => {
            const picked = e.target.files?.[0] ?? null;
            setReplaceFile(picked);
            setReplaceError(picked && pdfUploadProblem(picked));
          }}
          type="file"
        />
        <p
          className="mt-1 text-xs text-subtle max-md:text-sm"
          id="replace-file-help"
        >
          PDF only, up to 15MB.
        </p>
      </div>
      <input
        aria-label="Note (optional)"
        className={field}
        enterKeyHint="done"
        onChange={(e) => setReplaceNote(e.target.value)}
        placeholder="Note (optional)"
        value={replaceNote}
      />
      {replaceError && (
        <p className="text-sm font-bold text-destructive" role="alert">
          {replaceError}
        </p>
      )}
    </>
  );

  const placementOverlay = (page: number) => (
    <>
      {placedFields
        .filter((f) => f.page === page)
        .map((f) => {
          const caption = `${SIGNING_FIELD_DEFAULT_LABEL[f.type]} · ${signerLabel(f.signerId)}`;
          const color = placementSigners.find(
            (s) => s.id === f.signerId,
          )?.color;
          return coarse ? (
            <FieldFootprint
              caption={caption}
              color={color}
              key={f.id}
              selected={f.id === selectedFieldId}
              type={f.type}
              xPercent={f.xPercent}
              yPercent={f.yPercent}
            />
          ) : (
            <PlaceableField
              caption={caption}
              color={color}
              key={f.id}
              onDelete={() => deleteField(f.id)}
              onMove={(xPercent, yPercent) =>
                moveField(f.id, xPercent, yPercent)
              }
              type={f.type}
              xPercent={f.xPercent}
              yPercent={f.yPercent}
            />
          );
        })}
    </>
  );

  // The 44px targets over each footprint. Hidden while armed, so any tap
  // on the page places the new field.
  const placementTargets =
    coarse && !isArmed
      ? (page: number) =>
          placedFields
            .filter((f) => f.page === page)
            .map((f) => (
              <FieldHitTarget
                key={f.id}
                label={`${SIGNING_FIELD_DEFAULT_LABEL[f.type]} field for ${signerLabel(f.signerId)}, page ${page}`}
                onSelect={() => setSelectedFieldId(f.id)}
                selected={f.id === selectedFieldId}
                xPercent={f.xPercent}
                yPercent={f.yPercent}
              />
            ))
      : undefined;

  const startPanel = activeRequest ? (
    <Note>
      A signing request is in progress.{" "}
      <Link
        className="underline underline-offset-4"
        href={`/admin/documents/signing/${activeRequest.$key}`}
      >
        View it ›
      </Link>
    </Note>
  ) : (
    <Panel
      note="Each signer gets a link by email or in the portal, reviews the PDF in their browser and signs where you place their fields."
      title="Start a signing request"
    >
      <form className="flex flex-col gap-4" onSubmit={startSigning}>
        <div>
          <label className={labelClass} htmlFor="signing-title">
            Title
          </label>
          <input
            className={field}
            enterKeyHint="done"
            id="signing-title"
            onChange={(e) => setSigningTitle(e.target.value)}
            placeholder="e.g. Signing the 2025 banking resolution"
            value={signingTitle}
          />
        </div>

        <div>
          <span className={labelClass}>Order</span>
          <ToggleGroup
            className="max-md:w-full max-md:flex-nowrap"
            itemClassName="max-md:h-auto max-md:min-h-11 max-md:flex-1 max-md:whitespace-normal max-md:py-1.5"
            label="Order"
            onChange={setMode}
            options={[
              { value: "parallel", label: "All at once" },
              { value: "ordered", label: "One at a time, in order" },
            ]}
            value={mode}
          />
        </div>

        <div>
          <span className={labelClass}>Signers</span>
          <ul className="flex flex-col gap-2 max-md:gap-4">
            {signers.map((signer, index) => (
              <li
                className="flex flex-wrap items-center gap-2 md:flex-nowrap"
                key={signer.localId}
              >
                <SignerSwatch color={signerColor(index)} />
                {signer.kind === "member" ? (
                  <span className="min-w-0 rounded-[10px] border-2 border-line bg-tint px-3 py-1.5 text-sm font-bold max-md:flex-1 max-md:text-base">
                    {members.find((m) => m.id === signer.signupId)?.name ??
                      signer.signupId}{" "}
                    (member)
                  </span>
                ) : (
                  <>
                    <input
                      aria-label={`Signer ${index + 1} name`}
                      autoCapitalize="words"
                      autoComplete="off"
                      className={`${field} min-w-0 flex-1 basis-40`}
                      enterKeyHint="next"
                      onChange={(e) =>
                        updateExternal(signer.localId, {
                          name: e.target.value,
                        })
                      }
                      placeholder="Name"
                      value={signer.name}
                    />
                    <input
                      aria-label={`Signer ${index + 1} email`}
                      autoCapitalize="off"
                      autoComplete="off"
                      autoCorrect="off"
                      className={`${field} min-w-0 flex-1 basis-48 max-md:order-last max-md:basis-full`}
                      enterKeyHint="done"
                      inputMode="email"
                      onChange={(e) =>
                        updateExternal(signer.localId, {
                          email: e.target.value,
                        })
                      }
                      placeholder="Email"
                      spellCheck={false}
                      type="email"
                      value={signer.email}
                    />
                  </>
                )}
                <Button
                  aria-label={`Remove ${signerLabel(signer.localId)}`}
                  onClick={() => removeDraftSigner(signer.localId)}
                  className="pointer-coarse:h-11"
                  size="xs"
                  type="button"
                  variant="ghost"
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2 max-md:mt-3 max-md:flex-col max-md:items-stretch">
            <select
              aria-label="Add a member signer"
              className={field}
              onChange={(e) => addMemberSigner(e.target.value)}
              value=""
            >
              <option value="">Add a member signer...</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <Button
              className="pointer-coarse:h-11 max-md:h-11 max-md:w-full"
              onClick={addExternalSigner}
              size="sm"
              type="button"
              variant="secondary"
            >
              Add an external signer
            </Button>
          </div>
        </div>

        {!!signers.length && currentVersion && !currentIsPdf && (
          <Note>
            Fields can only be placed on a PDF. Upload this document as a PDF
            version above, then come back here.
          </Note>
        )}

        {!!signers.length && currentVersion && currentIsPdf && (
          <div>
            <span className={labelClass}>Where to sign</span>
            <p className="mb-3 text-sm text-subtle">
              <span className="hidden pointer-fine:inline">
                Choose a signer and a field, then click the page to place it.
                Drag a field to move it, nudge it with the arrow keys, or press
                Delete to remove it.
              </span>{" "}
              <span className="hidden pointer-coarse:inline">
                Choose a signer and a field type, tap Add field, then tap the
                page. Tap a placed field to move, change or delete it.
              </span>{" "}
              Date Signed and Name fill in on their own when that person signs.
            </p>
            <CompactPlacementBar
              armed={isArmed}
              fieldType={fieldType}
              onArm={arm}
              onDisarm={disarm}
              onFieldType={setFieldType}
              onSigner={chooseSigner}
              signerId={activeSignerId}
              signers={placementSigners}
            />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
              <div className="hidden flex-col gap-5 lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
                <SignerPicker
                  onChange={chooseSigner}
                  signers={placementSigners}
                  value={activeSignerId}
                />
                <FieldTypePicker onChange={setFieldType} value={fieldType} />
                <div className="hidden pointer-coarse:block">
                  <AddFieldControl
                    armed={isArmed}
                    disabled={!activeSignerId}
                    fieldType={fieldType}
                    onArm={arm}
                    onDisarm={disarm}
                    signerLabel={
                      activeSignerId ? signerLabel(activeSignerId) : undefined
                    }
                  />
                </div>
                <FieldLegend fields={placedFields} signers={placementSigners} />
              </div>
              <DocumentPreview
                contentType={currentVersion.contentType}
                fileUrl={documentFileUrl(currentVersion.$key)}
                key={currentVersion.$key}
                onPlace={addField}
                outside={placementTargets}
                overlay={placementOverlay}
                placing={coarse ? isArmed : !!activeSignerId}
              />
              <div className="lg:hidden">
                <FieldLegend fields={placedFields} signers={placementSigners} />
              </div>
            </div>
          </div>
        )}

        <div>
          {!!startBlockers.length && (
            <div className="mb-3" id="start-blockers">
              <p className="text-sm font-bold text-ink">
                Before you can send this:
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-subtle">
                {startBlockers.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </div>
          )}
          <Button
            aria-describedby={
              startBlockers.length ? "start-blockers" : undefined
            }
            className="max-md:w-full"
            disabled={starting || !!startBlockers.length}
            type="submit"
            variant="primary"
          >
            {starting ? "Starting..." : "Start signing request"}
          </Button>
        </div>
      </form>
      {selectedField && (
        <>
          {/* Room to scroll the page above the fixed strip on tablets. */}
          <div aria-hidden className="hidden h-36 desk:block" />
          <SelectedFieldStrip
            field={selectedField}
            onDelete={deleteSelected}
            onDone={() => setSelectedFieldId(null)}
            onNudge={(dx, dy) => nudgeField(selectedField.id, dx, dy)}
            onSigner={(signerId) => patchField(selectedField.id, { signerId })}
            onType={(type) => patchField(selectedField.id, { type })}
            signers={placementSigners}
          />
        </>
      )}
    </Panel>
  );

  if (phone) {
    const otherRequests = signingRequests.filter((r) => r !== activeRequest);
    const shownVersions = versions.slice().reverse();
    return (
      <AdminPage className="flex flex-col gap-6">
        <h1 className="sr-only">{document.title}</h1>
        {document.description && <Description text={document.description} />}
        {error && <p className="text-sm font-bold text-destructive">{error}</p>}

        {activeRequest && <ActiveRequestCard request={activeRequest} />}

        {currentVersion && (
          <section aria-labelledby="preview-heading">
            <h2 className={sectionTitle} id="preview-heading">
              Preview
            </h2>
            <DocumentPreview
              contentType={currentVersion.contentType}
              fileUrl={documentFileUrl(currentVersion.$key)}
              key={currentVersion.$key}
              onOpen={() => view.open(currentVersion.$key)}
            />
          </section>
        )}

        {!activeRequest && startPanel}

        {otherRequests.length > 0 && (
          <section aria-labelledby="requests-heading">
            <h2 className={sectionTitle} id="requests-heading">
              Signing requests
            </h2>
            <ul className="divide-y-2 divide-line/15 overflow-hidden rounded-[16px] border-2 border-line bg-surface">
              {otherRequests.map((r) => (
                <li key={r.$key}>
                  <Link
                    className="press-flat flex min-h-14 items-center gap-3 px-4 py-2"
                    href={`/admin/documents/signing/${r.$key}`}
                  >
                    <span className="line-clamp-2 min-w-0 flex-1 font-bold text-ink">
                      {r.title}
                    </span>
                    <Pill tone={r.status === "completed" ? "accent" : "flat"}>
                      {r.status}
                    </Pill>
                    <ChevronRight
                      aria-hidden
                      className="size-5 shrink-0 text-subtle"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <details
          className="group rounded-[16px] border-2 border-line bg-surface"
          ref={versionsRef}
        >
          <summary className="press-flat flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-[14px] px-4 font-bold text-ink [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1">
              {versions.length} version{versions.length === 1 ? "" : "s"}
            </span>
            <ChevronRight
              aria-hidden
              className="size-5 shrink-0 text-subtle transition-transform group-open:rotate-90"
            />
          </summary>
          <ul className="divide-y-2 divide-line/15 border-t-2 border-line/15">
            {shownVersions.map((v) => (
              <li key={v.$key}>
                <button
                  className="press-flat flex min-h-14 w-full flex-col items-start gap-1 px-4 py-3 text-left"
                  onClick={() => view.open(v.$key)}
                  type="button"
                >
                  <span className="font-bold wrap-anywhere text-ink">
                    {v.originalFilename}
                  </span>
                  <span className="text-sm text-subtle">
                    {formatSigningTime(v.uploadedAt)} by{" "}
                    {v.uploadedByName || v.uploadedBy}
                    {v.note ? ` — ${v.note}` : ""}
                  </span>
                  {(v.producedBySigningRequestId ||
                    document.currentVersionId === v.$key) && (
                    <span className="flex flex-wrap gap-2">
                      {versionBadge(v, document, signingRequests)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </details>

        <ActionSheet
          actions={[
            {
              key: "rename",
              label: "Rename",
              icon: PencilLine,
              onSelect: openRename,
            },
            {
              key: "version",
              label: "Upload new version",
              icon: FilePlus2,
              onSelect: () => {
                setReplaceError(null);
                setVersionSheet(true);
              },
            },
            {
              key: "history",
              label: "Version history",
              icon: History,
              onSelect: showVersions,
            },
            {
              key: "delete",
              label: "Delete document",
              icon: Trash2,
              destructive: true,
              onSelect: () => void removeDocument(),
            },
          ]}
          onClose={() => setActionsOpen(false)}
          open={actionsOpen}
          title={document.title}
        />

        <Sheet
          footer={
            <Button
              className="h-12 w-full"
              disabled={savingRename || !renameTitle.trim()}
              form="rename-form"
              type="submit"
              variant="primary"
            >
              {savingRename ? "Saving..." : "Save"}
            </Button>
          }
          initialFocus={renameInput}
          onClose={() => {
            if (!savingRename) closeRename();
          }}
          open={renaming}
          title="Rename"
        >
          <form
            className="flex flex-col gap-4"
            id="rename-form"
            onSubmit={saveRename}
          >
            {renameFields}
          </form>
        </Sheet>

        <Sheet
          footer={
            <Button
              className="h-12 w-full"
              disabled={
                uploading || !replaceFile || !!pdfUploadProblem(replaceFile)
              }
              form="replace-form"
              type="submit"
              variant="primary"
            >
              {uploading ? "Uploading..." : "Upload version"}
            </Button>
          }
          onClose={() => {
            if (!uploading) setVersionSheet(false);
          }}
          open={versionSheet}
          title="New version"
        >
          <form
            className="flex flex-col gap-4"
            id="replace-form"
            onSubmit={replace}
          >
            {replaceFields}
          </form>
        </Sheet>

        <DocumentViewer
          file={viewerFile}
          onClose={view.close}
          open={viewerFile != null}
        />
      </AdminPage>
    );
  }

  return (
    <AdminPage className="flex flex-col gap-6">
      <div>
        <Link
          className="text-sm font-bold text-subtle hover:text-ink"
          href="/admin/documents"
        >
          ← Documents
        </Link>
        {renaming ? (
          <form
            className="mt-3 flex flex-col gap-3 rounded-[20px] border-2 border-line bg-surface p-4 shadow-brut"
            onKeyDown={(e) => {
              if (e.key === "Escape" && !savingRename) {
                e.preventDefault();
                closeRename();
              }
            }}
            onSubmit={saveRename}
          >
            {renameFields}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={savingRename || !renameTitle.trim()}
                size="sm"
                type="submit"
                variant="primary"
              >
                {savingRename ? "Saving..." : "Save"}
              </Button>
              <Button
                disabled={savingRename}
                onClick={closeRename}
                size="sm"
                type="button"
                variant="secondary"
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="min-w-0 text-2xl font-extrabold wrap-anywhere text-ink">
                {document.title}
              </h1>
              <Button
                onClick={openRename}
                ref={renameButton}
                size="xs"
                type="button"
                variant="secondary"
              >
                Rename
              </Button>
            </div>
            {document.description && (
              <p className="mt-1 text-sm text-ink">{document.description}</p>
            )}
          </>
        )}
      </div>

      {note && <p className="text-sm font-bold text-brand">{note}</p>}
      {error && <p className="text-sm font-bold text-destructive">{error}</p>}

      <Panel
        action={
          <Button
            className="pointer-coarse:h-11"
            onClick={removeDocument}
            size="sm"
            type="button"
            variant="destructive"
          >
            Delete document
          </Button>
        }
        title="Versions"
      >
        <ul className="flex flex-col gap-2">
          {versions
            .slice()
            .reverse()
            .map((v) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border-2 border-line bg-surface p-3"
                key={v.$key}
              >
                <div>
                  <a
                    className="font-bold text-brand underline underline-offset-4"
                    href={documentFileUrl(v.$key)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {v.originalFilename}
                  </a>
                  <p className="text-xs text-subtle">
                    {new Date(v.uploadedAt).toLocaleString()} by{" "}
                    {v.uploadedByName || v.uploadedBy}
                    {v.note ? ` — ${v.note}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {versionBadge(v, document, signingRequests)}
                </div>
              </li>
            ))}
        </ul>

        <form
          className="mt-5 flex flex-col gap-3 border-t-2 border-line pt-4"
          onSubmit={replace}
        >
          {replaceFields}
          <div>
            <Button
              disabled={
                uploading || !replaceFile || !!pdfUploadProblem(replaceFile)
              }
              type="submit"
              variant="secondary"
            >
              {uploading ? "Uploading..." : "Upload version"}
            </Button>
          </div>
        </form>
      </Panel>

      {currentVersion && (
        <Panel title="Preview">
          <DocumentPreview
            contentType={currentVersion.contentType}
            fileUrl={documentFileUrl(currentVersion.$key)}
            key={currentVersion.$key}
          />
        </Panel>
      )}

      {startPanel}

      <Panel title="Signing requests">
        {signingRequests.length ? (
          <ul className="flex flex-col gap-2">
            {signingRequests.map((r) => (
              <li key={r.$key}>
                <Link
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border-2 border-line bg-surface p-3 hover:bg-tint"
                  href={`/admin/documents/signing/${r.$key}`}
                >
                  <span className="font-bold text-ink">{r.title}</span>
                  <Pill tone={r.status === "completed" ? "accent" : "flat"}>
                    {r.status}
                  </Pill>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-subtle">No signing requests yet.</p>
        )}
      </Panel>
    </AdminPage>
  );
}
