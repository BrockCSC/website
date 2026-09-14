"use client";

import { PenLine, Signature } from "lucide-react";
import type { SigningField } from "@/lib/api/types";
import {
  SIGNING_FIELD_DEFAULT_LABEL,
  todayIsoLocal,
} from "@/lib/documents/fields";
import type { AdoptedDraft } from "./adopted";
import { SIGNATURE_FONT_FAMILY, SIGNATURE_INK } from "./signature-fonts";

const MIN_TAG_SCALE = 0.7;

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

/**
 * One of this signer's fields, centred on its stored point. Everything here is
 * drawn on the always-white page, so paper colours are fixed rather than
 * themed; only the call-to-action tags use the brand tokens.
 */
export function FieldTag({
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
}: {
  field: SigningField;
  domId: string;
  scale: number;
  adopted: AdoptedDraft | null;
  stamped: boolean;
  textValue: string;
  disabled: boolean;
  onSign: () => void;
  onChangeSignature: () => void;
  onTextChange: (value: string) => void;
}) {
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
                kind={field.type}
                size={isSignature ? 28 : 22}
              />
            </div>
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
          className="pointer-events-auto relative ml-[18px] flex h-9 items-center gap-1.5 rounded-r-[10px] border-2 border-l-0 border-line bg-brand pr-3 pl-0.5 text-sm font-extrabold text-brand-ink before:absolute before:top-1/2 before:left-0 before:-z-10 before:size-[25px] before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-45 before:rounded-[3px] before:border-b-2 before:border-l-2 before:border-line before:bg-brand before:content-[''] hover:-translate-y-0.5 disabled:opacity-60"
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

    const filled = !!adopted;
    const value =
      field.type === "date"
        ? todayIsoLocal()
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
