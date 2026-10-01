"use client";

import { PenLine, Signature } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SigningField } from "@/lib/api/types";
import { SIGNING_FIELD_DEFAULT_LABEL } from "@/lib/documents/fields";
import { formatSignedDate } from "@/lib/documents/signing-time";
import type { AdoptedDraft } from "./adopted";
import { SIGNATURE_FONT_FAMILY, SIGNATURE_INK } from "./signature-fonts";

/** Tags someone has to tap never shrink below this, whatever the page scale. */
const MIN_TAG_SCALE = 0.7;
/** Touch screens: a finger needs a bigger tag than a mouse. */
const MIN_TAG_SCALE_COARSE = 0.85;
/** A touch target is never smaller than this, in CSS px. */
const MIN_HIT = 44;

const signTagClass =
  "pointer-events-auto relative ml-[18px] flex h-9 items-center gap-1.5 rounded-r-[10px] border-2 border-l-0 border-line bg-brand pr-3 pl-0.5 text-sm font-extrabold text-brand-ink before:absolute before:top-1/2 before:left-0 before:-z-10 before:size-[25px] before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-45 before:rounded-[3px] before:border-b-2 before:border-l-2 before:border-line before:bg-brand before:content-['']";

function RequiredMark() {
  return (
    <span
      aria-hidden
      className="absolute -top-2.5 -right-2.5 z-10 flex size-5 items-center justify-center rounded-full border-2 border-line bg-red-700 pt-1 text-base leading-none font-black text-white"
    >
      *
    </span>
  );
}

/** Adopted signature or initials as ink: the chosen font, or the drawn PNG. */
function AdoptedMark({
  adopted,
  kind,
  size,
}: {
  adopted: AdoptedDraft;
  kind: "signature" | "initials";
  size: number;
}) {
  const png =
    adopted.style === "drawn"
      ? kind === "signature"
        ? adopted.signaturePng
        : adopted.initialsPng
      : undefined;
  const text = kind === "signature" ? adopted.fullName : adopted.initials;
  if (png) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a local data URL the signer just drew.
      <img
        alt={text}
        className="block w-auto max-w-full object-contain"
        src={png}
        style={{ height: size * 1.25 }}
      />
    );
  }
  return (
    <span
      className="block leading-[1.15] whitespace-nowrap"
      style={{
        color: SIGNATURE_INK,
        fontFamily: adopted.font
          ? SIGNATURE_FONT_FAMILY[adopted.font]
          : undefined,
        fontSize: size,
      }}
    >
      {text}
    </span>
  );
}

function StampedMark({
  adopted,
  isSignature,
}: {
  adopted: AdoptedDraft;
  isSignature: boolean;
}) {
  return (
    <div
      className={`rounded-l-[10px] border-y-2 border-l-2 border-[#9a4440] bg-white/80 py-0.5 pr-2 pl-2 ${
        isSignature ? "min-w-[150px]" : "min-w-[64px]"
      }`}
    >
      <span className="block text-[8px] leading-tight font-bold tracking-wide text-neutral-600 uppercase">
        Signed by:
      </span>
      <AdoptedMark
        adopted={adopted}
        kind={isSignature ? "signature" : "initials"}
        size={isSignature ? 28 : 22}
      />
    </div>
  );
}

/** Name and date fields: filled in by the server, shown for reference. */
function AutoField({
  field,
  label,
  adopted,
}: {
  field: SigningField;
  label: string;
  adopted: AdoptedDraft | null;
}) {
  const filled = !!adopted;
  const value =
    field.type === "date"
      ? formatSignedDate(new Date().toISOString())
      : adopted?.fullName || SIGNING_FIELD_DEFAULT_LABEL.name;
  return (
    <div
      className={`rounded-[6px] border-2 border-dashed px-2 py-0.5 ${
        filled
          ? "border-neutral-400 bg-white/80"
          : "border-neutral-300 bg-neutral-100/90"
      }`}
      title={
        field.type === "date"
          ? "Filled in with the date you finish signing"
          : "Filled in with your adopted name"
      }
    >
      {(field.type === "date" || field.label?.trim() || filled) && (
        <span className="block text-[8px] leading-tight font-bold tracking-wide text-neutral-500 uppercase">
          {label}
        </span>
      )}
      <span
        className={`block text-sm whitespace-nowrap ${
          filled ? "text-neutral-900" : "text-neutral-400"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

type Props = {
  field: SigningField;
  domId: string;
  scale: number;
  adopted: AdoptedDraft | null;
  stamped: boolean;
  textValue: string;
  disabled: boolean;
  /** Touch screens: an unscaled hit target over a passive visual. */
  coarse: boolean;
  /** The hit target's full accessible name (coarse only). */
  hitLabel: string;
  onSign: () => void;
  onChangeSignature: () => void;
  onTextChange: (value: string) => void;
  /** Coarse: open the text sheet. */
  onTextOpen: () => void;
  /** Coarse: a stamped mark was tapped. */
  onStampedTap: () => void;
};

/**
 * One of this signer's fields, centred on its stored point. Everything here is
 * drawn on the always-white page, so paper colours are fixed rather than
 * themed; only the call-to-action tags use the brand tokens.
 */
export function FieldTag(props: Props) {
  return props.coarse ? (
    <CoarseFieldTag {...props} />
  ) : (
    <FineFieldTag {...props} />
  );
}

function FineFieldTag({
  field,
  domId,
  scale,
  adopted,
  stamped,
  textValue,
  disabled,
  onSign,
  onChangeSignature,
  onTextChange,
}: Props) {
  const label = field.label?.trim() || SIGNING_FIELD_DEFAULT_LABEL[field.type];
  const actionable =
    field.type === "text" ||
    ((field.type === "signature" || field.type === "initials") && !stamped);
  // Tags someone has to tap keep a usable size on a phone; finished marks track the page so they don't cover it.
  const tagScale = Math.min(
    1,
    actionable ? Math.max(MIN_TAG_SCALE, scale) : scale,
  );

  const body = (() => {
    if (field.type === "signature" || field.type === "initials") {
      const isSignature = field.type === "signature";
      if (stamped && adopted) {
        return (
          <div className="pointer-events-auto relative animate-pop-in">
            <StampedMark adopted={adopted} isSignature={isSignature} />
            <button
              aria-label={`Change your adopted ${isSignature ? "signature" : "initials"}`}
              className="absolute -top-5 -right-2 rounded-full border-2 border-line bg-surface px-1.5 text-[10px] leading-4 font-bold text-ink shadow-brut-sm hover:bg-tint disabled:opacity-50"
              disabled={disabled}
              id={domId}
              onClick={onChangeSignature}
              type="button"
            >
              Change
            </button>
          </div>
        );
      }
      const Icon = isSignature ? Signature : PenLine;
      return (
        <button
          aria-label={`${isSignature ? "Sign" : "Initial"} here${
            field.label ? `: ${field.label}` : ""
          } (required)`}
          className={`${signTagClass} hover:-translate-y-0.5 disabled:opacity-60`}
          disabled={disabled}
          id={domId}
          onClick={onSign}
          style={{ filter: "drop-shadow(3px 3px 0 var(--shade))" }}
          type="button"
        >
          <Icon aria-hidden className="size-4" />
          {isSignature ? "Sign" : "Initial"}
          <RequiredMark />
        </button>
      );
    }

    if (field.type === "text") {
      const missing = field.required && !textValue.trim();
      return (
        <div className="pointer-events-auto relative">
          <input
            aria-label={`${label}${field.required ? " (required)" : ""}`}
            aria-required={field.required}
            className={`w-[190px] rounded-[6px] border-2 bg-white px-2 py-1 text-sm text-neutral-900 placeholder:text-neutral-500 focus:border-[#9a4440] ${
              missing ? "border-[#9a4440] bg-[#fdf0ee]" : "border-neutral-500"
            }`}
            disabled={disabled}
            id={domId}
            maxLength={500}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder={label}
            value={textValue}
          />
          {missing && <RequiredMark />}
        </div>
      );
    }

    return <AutoField adopted={adopted} field={field} label={label} />;
  })();

  return (
    <div
      className="absolute"
      data-field-id={field.id}
      style={{
        left: `${field.xPercent}%`,
        top: `${field.yPercent}%`,
        transform: `translate(-50%, -50%) scale(${tagScale})`,
      }}
    >
      {body}
    </div>
  );
}

/**
 * Touch screens. The tag keeps its look inside the scaled wrapper but is
 * passive and hidden from assistive tech; a real, unscaled button of at least
 * 44x44 CSS px sits over it, carrying the full name. It renders after the
 * visual, so swipe order follows the page.
 */
function CoarseFieldTag({
  field,
  domId,
  scale,
  adopted,
  stamped,
  textValue,
  disabled,
  hitLabel,
  onSign,
  onTextOpen,
  onStampedTap,
}: Props) {
  const label = field.label?.trim() || SIGNING_FIELD_DEFAULT_LABEL[field.type];
  const isMark = field.type === "signature" || field.type === "initials";
  const isStamped = isMark && stamped && !!adopted;
  const actionable = field.type === "text" || (isMark && !isStamped);
  const tagScale = Math.min(
    1,
    actionable ? Math.max(MIN_TAG_SCALE_COARSE, scale) : scale,
  );

  const visualRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = visualRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setBox({ w: el.offsetWidth, h: el.offsetHeight }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const body = (() => {
    if (isMark) {
      const isSignature = field.type === "signature";
      if (isStamped) {
        return (
          <div className="relative animate-pop-in">
            <StampedMark adopted={adopted} isSignature={isSignature} />
          </div>
        );
      }
      const Icon = isSignature ? Signature : PenLine;
      return (
        <span
          className={signTagClass}
          style={{ filter: "drop-shadow(3px 3px 0 var(--shade))" }}
        >
          <Icon aria-hidden className="size-4" />
          {isSignature ? "Sign" : "Initial"}
          <RequiredMark />
        </span>
      );
    }
    if (field.type === "text") {
      const value = textValue.trim();
      const missing = field.required && !value;
      return (
        <div className="relative">
          <span
            className={`block w-[190px] truncate rounded-[6px] border-2 px-2 py-1 text-sm ${
              value ? "text-neutral-900" : "text-neutral-500"
            } ${
              missing
                ? "border-[#9a4440] bg-[#fdf0ee]"
                : "border-neutral-500 bg-white"
            }`}
          >
            {value || label}
          </span>
          {missing && <RequiredMark />}
        </div>
      );
    }
    return <AutoField adopted={adopted} field={field} label={label} />;
  })();

  const interactive = actionable || isStamped;
  const hitW = Math.max(MIN_HIT, (box?.w ?? 0) * tagScale);
  const hitH = Math.max(MIN_HIT, (box?.h ?? 0) * tagScale);

  return (
    <>
      <div
        aria-hidden={interactive || undefined}
        className="pointer-events-none absolute"
        data-field-id={field.id}
        ref={visualRef}
        style={{
          left: `${field.xPercent}%`,
          top: `${field.yPercent}%`,
          transform: `translate(-50%, -50%) scale(${tagScale})`,
        }}
      >
        {body}
      </div>
      {interactive && (
        <button
          aria-label={hitLabel}
          className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-[10px] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-default"
          disabled={disabled}
          id={domId}
          onClick={
            field.type === "text"
              ? onTextOpen
              : isStamped
                ? onStampedTap
                : onSign
          }
          style={{
            left: `${field.xPercent}%`,
            top: `${field.yPercent}%`,
            width: hitW,
            height: hitH,
          }}
          type="button"
        />
      )}
    </>
  );
}
