"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  Plus,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { ActionSheet } from "@/components/ui/action-sheet";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import type { SigningFieldType } from "@/lib/api/types";
import {
  SIGNING_FIELD_DEFAULT_LABEL,
  SIGNING_FIELD_TYPES,
} from "@/lib/documents/fields";
import { useChromeFlag } from "@/lib/use-chrome-flag";
import { cn } from "@/lib/utils";
import { FIELD_ICON } from "./field-chip";

export type PlacementSigner = { id: string; label: string; color: string };

export function SignerSwatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-3.5 shrink-0 rounded-full border-2 border-line"
      style={{ backgroundColor: color }}
    />
  );
}

const heading =
  "mb-2 block text-xs font-extrabold tracking-wide text-subtle uppercase";

export function SignerPicker({
  signers,
  value,
  onChange,
}: {
  signers: PlacementSigner[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <div>
      <span className={heading} id="placement-signer">
        Signer
      </span>
      <div
        aria-labelledby="placement-signer"
        className="flex flex-wrap gap-2 lg:flex-col"
        role="radiogroup"
      >
        {signers.map((s) => (
          <Button
            aria-checked={value === s.id}
            className="max-w-full justify-start"
            key={s.id}
            onClick={() => onChange(s.id)}
            role="radio"
            size="sm"
            type="button"
            variant={value === s.id ? "primary" : "outline"}
          >
            <SignerSwatch color={s.color} />
            <span className="truncate">{s.label}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

export function FieldTypePicker({
  value,
  onChange,
}: {
  value: SigningFieldType;
  onChange: (type: SigningFieldType) => void;
}) {
  return (
    <div>
      <span className={heading} id="placement-field-type">
        Field
      </span>
      <div
        aria-labelledby="placement-field-type"
        className="flex flex-wrap gap-2 lg:flex-col"
        role="radiogroup"
      >
        {SIGNING_FIELD_TYPES.map((option) => {
          const Icon = FIELD_ICON[option.value];
          return (
            <Button
              aria-checked={value === option.value}
              className="justify-start"
              key={option.value}
              onClick={() => onChange(option.value)}
              role="radio"
              size="sm"
              type="button"
              variant={value === option.value ? "primary" : "outline"}
            >
              <Icon aria-hidden />
              {option.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export function FieldLegend({
  signers,
  fields,
}: {
  signers: PlacementSigner[];
  fields: { signerId: string; type: SigningFieldType }[];
}) {
  return (
    <div>
      <span className={heading} id="placement-legend">
        Placed fields
      </span>
      <ul aria-labelledby="placement-legend" className="flex flex-col gap-2">
        {signers.map((s) => {
          const mine = fields.filter((f) => f.signerId === s.id);
          const counts = SIGNING_FIELD_TYPES.map(({ value }) => ({
            type: value,
            count: mine.filter((f) => f.type === value).length,
          })).filter((c) => c.count);
          return (
            <li className="flex min-w-0 items-start gap-2 text-xs" key={s.id}>
              <span className="mt-0.5">
                <SignerSwatch color={s.color} />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-bold text-ink">
                  {s.label}
                </span>
                <span className="block text-subtle">
                  {mine.length
                    ? counts
                        .map(
                          (c) =>
                            `${SIGNING_FIELD_DEFAULT_LABEL[c.type]}${c.count > 1 ? ` ×${c.count}` : ""}`,
                        )
                        .join(", ")
                    : "No fields yet"}
                </span>
                {!mine.some((f) => f.type === "signature") && (
                  <span className="block font-bold text-destructive">
                    Needs a Signature field
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const FIELD_OPTIONS = SIGNING_FIELD_TYPES.map((option) => ({
  value: option.value,
  label: option.label,
  icon: FIELD_ICON[option.value],
}));

const armedPrompt = (signer: string | undefined, type: SigningFieldType) =>
  `Tap where ${signer ?? "they"} should ${
    type === "signature" ? "sign" : `get ${SIGNING_FIELD_DEFAULT_LABEL[type]}`
  }`;

/**
 * Below lg: the signer and field-type pickers as one compact row that sticks
 * under the header while the page scrolls by (spec §3.7 step 4, docs-5
 * interim). On coarse pointers it also arms placement: nothing lands on the
 * page until "Add field" is tapped.
 */
export function CompactPlacementBar({
  signers,
  signerId,
  onSigner,
  fieldType,
  onFieldType,
  armed,
  onArm,
  onDisarm,
}: {
  signers: PlacementSigner[];
  signerId: string | null;
  onSigner: (id: string) => void;
  fieldType: SigningFieldType;
  onFieldType: (type: SigningFieldType) => void;
  armed: boolean;
  onArm: () => void;
  onDisarm: () => void;
}) {
  const active = signers.find((s) => s.id === signerId);
  return (
    <div className="sticky top-[var(--admin-top)] z-20 -mx-4 mb-3 flex max-md:-mb-0.5 flex-col gap-2 border-y-2 border-line bg-surface px-4 py-2 desk:top-0 lg:hidden">
      <div
        aria-label="Signer"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]"
        role="radiogroup"
      >
        {signers.map((s) => {
          const on = s.id === signerId;
          return (
            <button
              aria-checked={on}
              className={cn(
                "inline-flex min-h-11 max-w-[14rem] shrink-0 items-center gap-2 rounded-[10px] border-2 border-line px-3 text-sm font-bold",
                on ? "bg-ink text-surface" : "press-flat bg-surface text-ink",
              )}
              key={s.id}
              onClick={() => onSigner(s.id)}
              role="radio"
              type="button"
            >
              <SignerSwatch color={s.color} />
              <span className="truncate">{s.label}</span>
            </button>
          );
        })}
      </div>
      {armed ? (
        <div className="flex min-h-[3.25rem] items-center gap-3 rounded-[16px] border-2 border-line bg-tint px-3">
          <p
            className="min-w-0 flex-1 text-base font-bold text-ink"
            role="status"
          >
            {armedPrompt(active?.label, fieldType)}
          </p>
          <button
            className="press-flat min-h-11 shrink-0 rounded-[10px] px-2 font-bold text-ink"
            onClick={onDisarm}
            type="button"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Segmented
            className="min-w-0 flex-1"
            iconOnly
            label="Field type"
            onChange={onFieldType}
            options={FIELD_OPTIONS}
            value={fieldType}
          />
          <Button
            aria-label="Add field"
            className="hidden h-[3.25rem] shrink-0 px-3 pointer-coarse:inline-flex"
            disabled={!signerId}
            onClick={onArm}
            type="button"
            variant="outline"
          >
            <Plus aria-hidden />
            Add
          </Button>
        </div>
      )}
    </div>
  );
}

/** lg and up on a coarse pointer (tablets): the same arm/cancel control in the side column. */
export function AddFieldControl({
  signerLabel,
  fieldType,
  armed,
  disabled,
  onArm,
  onDisarm,
}: {
  signerLabel: string | undefined;
  fieldType: SigningFieldType;
  armed: boolean;
  disabled: boolean;
  onArm: () => void;
  onDisarm: () => void;
}) {
  return armed ? (
    <div className="flex flex-col gap-2 rounded-[16px] border-2 border-line bg-tint p-3">
      <p className="text-base font-bold text-ink" role="status">
        {armedPrompt(signerLabel, fieldType)}
      </p>
      <Button
        className="h-11"
        onClick={onDisarm}
        type="button"
        variant="outline"
      >
        Cancel
      </Button>
    </div>
  ) : (
    <Button
      className="h-11"
      disabled={disabled}
      onClick={onArm}
      type="button"
      variant="outline"
    >
      <Plus aria-hidden />
      Add field
    </Button>
  );
}

const STEP = 0.5;
const HOLD_DELAY_MS = 350;
const REPEAT_MS = 70;

function NudgeButton({
  label,
  icon: Icon,
  onNudge,
}: {
  label: string;
  icon: LucideIcon;
  onNudge: () => void;
}) {
  const timers = useRef<{
    delay?: ReturnType<typeof setTimeout>;
    repeat?: ReturnType<typeof setInterval>;
  }>({});
  const onNudgeRef = useRef(onNudge);
  useLayoutEffect(() => {
    onNudgeRef.current = onNudge;
  });
  const stop = () => {
    clearTimeout(timers.current.delay);
    clearInterval(timers.current.repeat);
  };
  useEffect(() => {
    const current = timers.current;
    return () => {
      clearTimeout(current.delay);
      clearInterval(current.repeat);
    };
  }, []);

  return (
    <button
      aria-label={label}
      className="press-flat grid size-11 shrink-0 touch-none place-items-center rounded-[10px] border-2 border-[var(--line-strong)] text-ink"
      onClick={(e) => {
        // Keyboard activation; pointers nudge on pointerdown.
        if (e.detail === 0) onNudgeRef.current();
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerCancel={stop}
      onPointerDown={() => {
        stop();
        onNudgeRef.current();
        timers.current.delay = setTimeout(() => {
          timers.current.repeat = setInterval(
            () => onNudgeRef.current(),
            REPEAT_MS,
          );
        }, HOLD_DELAY_MS);
      }}
      onPointerLeave={stop}
      onPointerUp={stop}
      type="button"
    >
      <Icon aria-hidden className="size-5" strokeWidth={2.5} />
    </button>
  );
}

const noop = () => () => {};
const useIsClient = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

const stripPill =
  "press-flat inline-flex min-h-11 min-w-0 items-center gap-2 rounded-[10px] border-2 border-[var(--line-strong)] px-3 text-base font-bold text-ink";

/**
 * Coarse pointers: the selected field's controls in a fixed bottom strip in
 * the tab bar's slot. Signer and type open action sheets; the arrows nudge by
 * half a percent and repeat while held.
 */
export function SelectedFieldStrip({
  field,
  signers,
  onNudge,
  onSigner,
  onType,
  onDelete,
  onDone,
}: {
  field: { type: SigningFieldType; signerId: string; page: number };
  signers: PlacementSigner[];
  onNudge: (dx: number, dy: number) => void;
  onSigner: (id: string) => void;
  onType: (type: SigningFieldType) => void;
  onDelete: () => void;
  onDone: () => void;
}) {
  useChromeFlag("toolbar", true);
  const isClient = useIsClient();
  const stripRef = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState<"signer" | "type" | null>(null);
  const signer = signers.find((s) => s.id === field.signerId);
  const TypeIcon = FIELD_ICON[field.type];
  const typeLabel = SIGNING_FIELD_DEFAULT_LABEL[field.type];

  // Taller than a BottomToolbar: publish the real height so toasts and the
  // page's bottom padding clear it.
  useLayoutEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () =>
      root.style.setProperty(
        "--admin-toolbar",
        `calc(${el.offsetHeight}px - env(safe-area-inset-bottom))`,
      );
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--admin-toolbar");
    };
  }, [isClient]);

  if (!isClient) return null;

  return createPortal(
    <>
      <div
        aria-label={`Selected field, page ${field.page}`}
        className="chrome fixed inset-x-0 bottom-0 z-40 flex flex-col gap-2 border-t-2 border-line bg-surface pt-2 pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pointer-fine:hidden [:root[data-kb-open]_&]:hidden"
        ref={stripRef}
        role="group"
      >
        <div className="flex items-center gap-2">
          <button
            aria-haspopup="dialog"
            aria-label={`Signer: ${signer?.label ?? "none"}. Change`}
            className={cn(stripPill, "flex-1")}
            onClick={() => setSheet("signer")}
            type="button"
          >
            {signer && <SignerSwatch color={signer.color} />}
            <span className="truncate">{signer?.label ?? "Signer"}</span>
            <ChevronDown aria-hidden className="ml-auto size-4 shrink-0" />
          </button>
          <button
            aria-haspopup="dialog"
            aria-label={`Type: ${typeLabel}. Change`}
            className={cn(stripPill, "shrink-0")}
            onClick={() => setSheet("type")}
            type="button"
          >
            <TypeIcon aria-hidden className="size-4 shrink-0" />
            <span className="max-w-[6.5rem] truncate max-[400px]:sr-only">
              {typeLabel}
            </span>
            <ChevronDown aria-hidden className="size-4 shrink-0" />
          </button>
          <button
            className="press-flat min-h-11 shrink-0 rounded-[10px] px-2 font-extrabold text-ink"
            onClick={onDone}
            type="button"
          >
            Done
          </button>
        </div>
        <div className="flex items-center gap-2">
          <NudgeButton
            icon={ArrowLeft}
            label="Move left"
            onNudge={() => onNudge(-STEP, 0)}
          />
          <NudgeButton
            icon={ArrowUp}
            label="Move up"
            onNudge={() => onNudge(0, -STEP)}
          />
          <NudgeButton
            icon={ArrowDown}
            label="Move down"
            onNudge={() => onNudge(0, STEP)}
          />
          <NudgeButton
            icon={ArrowRight}
            label="Move right"
            onNudge={() => onNudge(STEP, 0)}
          />
          <button
            className="press-flat ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 font-bold text-destructive"
            onClick={onDelete}
            type="button"
          >
            <Trash2 aria-hidden className="size-5" />
            Delete
          </button>
        </div>
      </div>
      <ActionSheet
        actions={signers.map((s) => ({
          key: s.id,
          label: s.id === field.signerId ? `${s.label} (current)` : s.label,
          onSelect: () => onSigner(s.id),
        }))}
        onClose={() => setSheet(null)}
        open={sheet === "signer"}
        title="Who fills in this field?"
      />
      <ActionSheet
        actions={SIGNING_FIELD_TYPES.map((option) => ({
          key: option.value,
          icon: FIELD_ICON[option.value],
          label:
            option.value === field.type
              ? `${option.label} (current)`
              : option.label,
          onSelect: () => onType(option.value),
        }))}
        onClose={() => setSheet(null)}
        open={sheet === "type"}
        title="Field type"
      />
    </>,
    document.body,
  );
}
