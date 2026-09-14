"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DocumentPreview } from "@/components/documents/document-preview";
import { PlaceableField } from "@/components/documents/field-chip";
import { Button } from "@/components/ui/button";
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
  startSigningRequest,
  type DocumentItem,
  type DocumentVersionItem,
  type MemberOption,
  type SigningRequestItem,
} from "@/lib/api/documents";
import {
  SIGNING_FIELD_DEFAULT_LABEL,
  SIGNING_FIELD_TYPES,
} from "@/lib/documents/fields";
import { useSession } from "../../session";
import { ask } from "../../ask";
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

export default function DocumentDetailPage() {
  const id = useParams().id as string;
  const router = useRouter();
  const { user } = useSession();
  const [document, setDocument] = useState<DocumentItem | null>(null);
  const [versions, setVersions] = useState<DocumentVersionItem[]>([]);
  const [signingRequests, setSigningRequests] = useState<SigningRequestItem[]>(
    [],
  );
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [replaceNote, setReplaceNote] = useState("");
  const [uploading, setUploading] = useState(false);

  const [signingTitle, setSigningTitle] = useState("");
  const [mode, setMode] = useState<"ordered" | "parallel">("parallel");
  const [signers, setSigners] = useState<SignerDraft[]>([]);
  const [starting, setStarting] = useState(false);

  const [fieldType, setFieldType] = useState<SigningFieldType>("signature");
  const [activeSignerId, setActiveSignerId] = useState<string | null>(null);
  const [placedFields, setPlacedFields] = useState<FieldDraft[]>([]);

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

  const replace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replaceFile) return;
    setUploading(true);
    setError(null);
    setNote(null);
    try {
      const result = await addDocumentVersion(
        id,
        replaceFile,
        replaceNote.trim() || undefined,
      );
      setNote(
        "pending" in result
          ? "Submitted for a co-president to approve."
          : "Uploaded.",
      );
      setReplaceFile(null);
      setReplaceNote("");
      await load();
    } catch (err) {
      setError(
        (err instanceof ApiError && err.detail) ||
          "Could not upload that version.",
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
        setNote("Submitted for a co-president to approve.");
      } else {
        router.push("/admin/documents");
      }
    } catch (err) {
      setError(
        (err instanceof ApiError && err.detail) ||
          "Could not delete this document.",
      );
    }
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

  const removeDraftSigner = (localId: string) => {
    setSigners((s) => s.filter((signer) => signer.localId !== localId));
    setPlacedFields((prev) => prev.filter((f) => f.signerId !== localId));
    setActiveSignerId((current) => (current === localId ? null : current));
  };

  const signerLabel = (localId: string) => {
    const signer = signers.find((s) => s.localId === localId);
    if (!signer) return "Signer";
    return signer.kind === "member"
      ? (members.find((m) => m.id === signer.signupId)?.name ?? "Member")
      : signer.name.trim() || "External signer";
  };

  const addField = (page: number, xPercent: number, yPercent: number) => {
    if (!activeSignerId) return;
    setPlacedFields((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        page,
        required: true,
        signerId: activeSignerId,
        type: fieldType,
        xPercent,
        yPercent,
      },
    ]);
  };

  const moveField = (id: string, xPercent: number, yPercent: number) =>
    setPlacedFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, xPercent, yPercent } : f)),
    );

  const deleteField = (id: string) =>
    setPlacedFields((prev) => prev.filter((f) => f.id !== id));

  const startSigning = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signingTitle.trim() || !signers.length) return;
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
        fields: fieldsInput.length ? fieldsInput : undefined,
      });
      setNote(
        "pending" in result
          ? "Submitted for a co-president to approve."
          : "Signing request sent.",
      );
      setSigningTitle("");
      setSigners([]);
      setPlacedFields([]);
      setActiveSignerId(null);
      await load();
    } catch (err) {
      setError(
        (err instanceof ApiError && err.detail) || "Could not start signing.",
      );
    } finally {
      setStarting(false);
    }
  };

  if (!user?.isExecutive) {
    return (
      <div className="mx-auto w-full max-w-[1060px] px-5 py-8">
        <Note>Only signed-in execs can see documents.</Note>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1060px] px-5 py-8">
        <p className="font-bold text-subtle">Loading...</p>
      </div>
    );
  }
  if (!document) {
    return (
      <div className="mx-auto w-full max-w-[1060px] px-5 py-8">
        <Note>That document doesn&apos;t exist.</Note>
      </div>
    );
  }

  const currentVersion = versions.find(
    (v) => v.$key === document.currentVersionId,
  );

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
          {document.title}
        </h1>
        <p className="text-subtle">{document.category}</p>
        {document.description && (
          <p className="mt-1 text-sm text-ink">{document.description}</p>
        )}
      </div>

      {note && <p className="text-sm font-bold text-brand">{note}</p>}
      {error && <p className="text-sm font-bold text-destructive">{error}</p>}

      <Panel
        action={
          <Button
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
                  {v.producedBySigningRequestId && (
                    <Pill tone="accent">Signing certificate</Pill>
                  )}
                  {document.currentVersionId === v.$key && (
                    <Pill tone="accent">Current</Pill>
                  )}
                </div>
              </li>
            ))}
        </ul>

        <form
          className="mt-5 flex flex-col gap-3 border-t-2 border-line pt-4"
          onSubmit={replace}
        >
          <label className={labelClass} htmlFor="replace-file">
            Upload a new version
          </label>
          <input
            accept=".pdf,.png,.jpg,.jpeg,.docx"
            className={field}
            id="replace-file"
            onChange={(e) => setReplaceFile(e.target.files?.[0] ?? null)}
            type="file"
          />
          <input
            className={field}
            onChange={(e) => setReplaceNote(e.target.value)}
            placeholder="Note (optional)"
            value={replaceNote}
          />
          <div>
            <Button
              disabled={uploading || !replaceFile}
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

      <Panel
        note="Signers review the current version and respond by email or in the portal."
        title="Start a signing request"
      >
        <form className="flex flex-col gap-4" onSubmit={startSigning}>
          <div>
            <label className={labelClass} htmlFor="signing-title">
              Title
            </label>
            <input
              className={field}
              id="signing-title"
              onChange={(e) => setSigningTitle(e.target.value)}
              placeholder="e.g. Signing the 2025 banking resolution"
              value={signingTitle}
            />
          </div>

          <div>
            <span className={labelClass}>Order</span>
            <ToggleGroup
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
            <ul className="flex flex-col gap-2">
              {signers.map((signer) => (
                <li className="flex items-center gap-2" key={signer.localId}>
                  {signer.kind === "member" ? (
                    <span className="rounded-[10px] border-2 border-line bg-tint px-3 py-1.5 text-sm font-bold">
                      {members.find((m) => m.id === signer.signupId)?.name ??
                        signer.signupId}{" "}
                      (member)
                    </span>
                  ) : (
                    <>
                      <input
                        className={field}
                        onChange={(e) =>
                          updateExternal(signer.localId, {
                            name: e.target.value,
                          })
                        }
                        placeholder="Name"
                        value={signer.name}
                      />
                      <input
                        className={field}
                        onChange={(e) =>
                          updateExternal(signer.localId, {
                            email: e.target.value,
                          })
                        }
                        placeholder="Email"
                        value={signer.email}
                      />
                    </>
                  )}
                  <Button
                    onClick={() => removeDraftSigner(signer.localId)}
                    size="xs"
                    type="button"
                    variant="ghost"
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
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
                onClick={addExternalSigner}
                size="sm"
                type="button"
                variant="secondary"
              >
                Add an external signer
              </Button>
            </div>
          </div>

          {!!signers.length && currentVersion && (
            <div>
              <span className={labelClass}>Where to sign (optional)</span>
              <p className="mb-3 text-sm text-subtle">
                Pick a field type and a signer, then click on the preview to
                place it. Drag a placed field to move it, or use its × to remove
                it.
              </p>
              <div className="mb-3 flex flex-wrap gap-4">
                <ToggleGroup
                  label="Field type"
                  onChange={setFieldType}
                  options={SIGNING_FIELD_TYPES}
                  value={fieldType}
                />
                <ToggleGroup
                  label="For signer"
                  onChange={setActiveSignerId}
                  options={signers.map((s) => ({
                    value: s.localId,
                    label: signerLabel(s.localId),
                  }))}
                  value={activeSignerId}
                />
              </div>
              <DocumentPreview
                contentType={currentVersion.contentType}
                fileUrl={documentFileUrl(currentVersion.$key)}
                key={currentVersion.$key}
                onPlace={addField}
                overlay={(page) => (
                  <>
                    {placedFields
                      .filter((f) => f.page === page)
                      .map((f) => (
                        <PlaceableField
                          caption={`${SIGNING_FIELD_DEFAULT_LABEL[f.type]} · ${signerLabel(f.signerId)}`}
                          key={f.id}
                          onDelete={() => deleteField(f.id)}
                          onMove={(xPercent, yPercent) =>
                            moveField(f.id, xPercent, yPercent)
                          }
                          type={f.type}
                          xPercent={f.xPercent}
                          yPercent={f.yPercent}
                        />
                      ))}
                  </>
                )}
                placing={!!activeSignerId}
              />
            </div>
          )}

          <div>
            <Button
              disabled={
                starting ||
                !signingTitle.trim() ||
                !signers.length ||
                !document.currentVersionId
              }
              type="submit"
              variant="primary"
            >
              {starting ? "Starting..." : "Start signing request"}
            </Button>
            {!document.currentVersionId && (
              <p className="mt-2 text-xs text-subtle">
                Upload a version first.
              </p>
            )}
          </div>
        </form>
      </Panel>

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
    </div>
  );
}
