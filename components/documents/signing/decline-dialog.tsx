"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "./modal";

export function DeclineDialog({
  busy,
  error,
  onConfirm,
  onClose,
}: {
  busy: boolean;
  error: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [reason, setReason] = useState("");

  return (
    <Modal
      footer={
        <>
          <Button
            disabled={busy}
            onClick={onClose}
            size="sm"
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={() => onConfirm(reason.trim())}
            size="sm"
            type="button"
            variant="destructive"
          >
            {busy ? "Declining..." : "Decline to sign"}
          </Button>
        </>
      }
      onClose={() => !busy && onClose()}
      title="Decline to sign"
    >
      <p className="text-sm text-ink">
        Declining ends your part in this request and closes it for everyone. The
        sender will be told. This can&apos;t be undone.
      </p>
      <label
        className="mt-4 mb-1 block text-sm font-bold text-ink"
        htmlFor={id}
      >
        Reason (optional)
      </label>
      <textarea
        className="min-h-[96px] w-full rounded-[10px] border-2 border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-subtle focus:border-brand"
        data-autofocus
        id={id}
        maxLength={500}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Let the sender know why"
        value={reason}
      />
      {error && (
        <p className="mt-3 text-sm font-bold text-destructive" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
