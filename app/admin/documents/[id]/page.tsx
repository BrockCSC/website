"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import type { SignerInput } from "@/lib/api/types";
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
import { useSession } from "../../session";
import { ask } from "../../ask";
import { Note, Panel, Pill, field, labelClass } from "../../users/ui";

type SignerDraft =
  | { kind: "member"; signupId: string }
  | { kind: "external"; name: string; email: string };

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
    setSigners((s) => [...s, { kind: "member", signupId }]);
  };

  const addExternalSigner = () =>
    setSigners((s) => [...s, { kind: "external", name: "", email: "" }]);

  const updateExternal = (
    index: number,
    patch: Partial<{ name: string; email: string }>,
  ) =>
    setSigners((s) =>
      s.map((signer, i) =>
        i === index && signer.kind === "external"
          ? { ...signer, ...patch }
          : signer,
      ),
    );

  const removeDraftSigner = (index: number) =>
    setSigners((s) => s.filter((_, i) => i !== index));

  const startSigning = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signingTitle.trim() || !signers.length) return;
    setStarting(true);
    setError(null);
    setNote(null);
    try {
      const input: SignerInput[] = signers.map((s) =>
        s.kind === "member"
          ? { kind: "member", signupId: s.signupId }
          : { kind: "external", name: s.name, email: s.email },
      );
      const result = await startSigningRequest(id, {
        title: signingTitle.trim(),
        mode,
        signers: input,
      });
      setNote(
        "pending" in result
          ? "Submitted for a co-president to approve."
          : "Signing request sent.",
      );
      setSigningTitle("");
      setSigners([]);
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
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  checked={mode === "parallel"}
                  onChange={() => setMode("parallel")}
                  type="radio"
                />
                All at once
              </label>
              <label className="flex items-center gap-2">
                <input
                  checked={mode === "ordered"}
                  onChange={() => setMode("ordered")}
                  type="radio"
                />
                One at a time, in order
              </label>
            </div>
          </div>

          <div>
            <span className={labelClass}>Signers</span>
            <ul className="flex flex-col gap-2">
              {signers.map((signer, i) => (
                <li className="flex items-center gap-2" key={i}>
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
                          updateExternal(i, { name: e.target.value })
                        }
                        placeholder="Name"
                        value={signer.name}
                      />
                      <input
                        className={field}
                        onChange={(e) =>
                          updateExternal(i, { email: e.target.value })
                        }
                        placeholder="Email"
                        value={signer.email}
                      />
                    </>
                  )}
                  <Button
                    onClick={() => removeDraftSigner(i)}
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
