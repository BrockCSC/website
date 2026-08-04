import { Button } from "./button";

export default function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-1 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl border-2 border-black shadow-[4px_4px_0px_#9A4440] p-6 max-w-xl w-full max-h-[80vh] overflow-y-auto relative">
        {title && <h2 className="text-lg font-bold mb-4">{title}</h2>}
        <button
          className="absolute top-4 right-4 text-black font-bold text-xl border-2 border-black rounded-full w-8 h-8 flex items-center justify-center bg-neutral-100 hover:bg-neutral-200"
          onClick={() => onClose()}
          aria-label="Close modal"
        >
          ×
        </button>
        <>{children}</>
      </div>
    </div>
  );
}

export function ConfirmationModal({
  open,
  onClose,
  title,
  message,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  onConfirm: () => Promise<void> | void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="mb-6 mt-[-15px]">{message}</p>
      <div className="flex justify-end gap-4">
        <Button onClick={() => onClose()} variant={"secondary"}>
          Cancel
        </Button>
        <Button
          onClick={async () => {
            await onConfirm();
            onClose();
          }}
          variant={"destructive"}
        >
          Confirm
        </Button>
      </div>
    </Modal>
  );
}
