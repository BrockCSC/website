"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SignatureFontId } from "@/lib/api/types";
import { SIGNATURE_FONTS } from "@/lib/documents/fields";
import { initialsFrom, type AdoptedDraft } from "./adopted";
import { Modal } from "./modal";
import { SIGNATURE_FONT_FAMILY, SIGNATURE_INK } from "./signature-fonts";
import { SignaturePad } from "./signature-pad";

type Tab = "style" | "draw";

const inputClass =
  "w-full rounded-[10px] border-2 border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-subtle focus:border-brand";

export function AdoptSignatureModal({
  defaultName,
  current,
  onAdopt,
  onClose,
}: {
  defaultName: string;
  current: AdoptedDraft | null;
  onAdopt: (adopted: AdoptedDraft) => void;
  onClose: () => void;
}) {
  const baseId = useId();
  const [fullName, setFullName] = useState(current?.fullName ?? defaultName);
  const [initials, setInitials] = useState(
    current?.initials ?? initialsFrom(defaultName),
  );
  const initialsTouched = useRef(!!current);
  const [tab, setTab] = useState<Tab>(
    current?.style === "drawn" ? "draw" : "style",
  );
  const [font, setFont] = useState<SignatureFontId>(
    current?.font ?? SIGNATURE_FONTS[0].id,
  );
  const [signaturePng, setSignaturePng] = useState<string | null>(null);
  const [initialsPng, setInitialsPng] = useState<string | null>(null);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({
    style: null,
    draw: null,
  });

  const name = fullName.trim();
  const inits = initials.trim();
  const ready =
    !!name && !!inits && (tab === "style" || (!!signaturePng && !!initialsPng));

  const adopt = () => {
    if (!ready) return;
    onAdopt(
      tab === "style"
        ? { fullName: name, initials: inits, style: "typed", font }
        : {
            fullName: name,
            initials: inits,
            style: "drawn",
            signaturePng: signaturePng!,
            initialsPng: initialsPng!,
          },
    );
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "style", label: "Choose style" },
    { id: "draw", label: "Draw" },
  ];

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} size="sm" type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={!ready} onClick={adopt} size="sm" type="button">
            Adopt and Sign
          </Button>
        </>
      }
      onClose={onClose}
      size="lg"
      title="Adopt your signature"
    >
      <p className="text-sm text-subtle">
        Confirm your name, initials and signature.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_9rem]">
        <div>
          <label
            className="mb-1 block text-sm font-bold text-ink"
            htmlFor={`${baseId}-name`}
          >
            Full name
          </label>
          <input
            autoComplete="name"
            className={inputClass}
            data-autofocus
            id={`${baseId}-name`}
            maxLength={100}
            onChange={(e) => {
              setFullName(e.target.value);
              if (!initialsTouched.current) {
                setInitials(initialsFrom(e.target.value));
              }
            }}
            value={fullName}
          />
        </div>
        <div>
          <label
            className="mb-1 block text-sm font-bold text-ink"
            htmlFor={`${baseId}-initials`}
          >
            Initials
          </label>
          <input
            className={inputClass}
            id={`${baseId}-initials`}
            maxLength={5}
            onChange={(e) => {
              initialsTouched.current = true;
              setInitials(e.target.value);
            }}
            value={initials}
          />
        </div>
      </div>

      <div
        aria-label="Signature style"
        className="mt-5 flex gap-1 border-b-2 border-line"
        role="tablist"
      >
        {tabs.map((t, i) => (
          <button
            aria-controls={`${baseId}-panel-${t.id}`}
            aria-selected={tab === t.id}
            className={`-mb-0.5 rounded-t-[10px] border-2 px-4 py-2 text-sm font-bold ${
              tab === t.id
                ? "border-line border-b-surface bg-surface text-brand"
                : "border-transparent text-subtle hover:text-ink"
            }`}
            id={`${baseId}-tab-${t.id}`}
            key={t.id}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const next =
                tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + 2) % 2];
              setTab(next.id);
              tabRefs.current[next.id]?.focus();
            }}
            ref={(el) => {
              tabRefs.current[t.id] = el;
            }}
            role="tab"
            tabIndex={tab === t.id ? 0 : -1}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        aria-labelledby={`${baseId}-tab-style`}
        className="pt-4"
        hidden={tab !== "style"}
        id={`${baseId}-panel-style`}
        role="tabpanel"
      >
        <fieldset className="min-w-0">
          <legend className="sr-only">Pick a style</legend>
          <div className="flex flex-col gap-2">
            {SIGNATURE_FONTS.map((option) => {
              const selected = font === option.id;
              return (
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-[12px] border-2 p-2 pr-3 ${
                    selected
                      ? "border-line bg-tint shadow-brut-sm"
                      : "border-line/40 hover:border-line"
                  }`}
                  key={option.id}
                >
                  <input
                    checked={selected}
                    className="check rounded-full"
                    name={`${baseId}-font`}
                    onChange={() => setFont(option.id)}
                    type="radio"
                    value={option.id}
                  />
                  <span className="sr-only">{option.label}</span>
                  <span
                    aria-hidden
                    className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden rounded-[8px] border-2 border-neutral-200 bg-white px-3 py-1.5"
                    style={{
                      color: SIGNATURE_INK,
                      fontFamily: SIGNATURE_FONT_FAMILY[option.id],
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate text-[26px] leading-[1.3]">
                      {name || "Your name"}
                    </span>
                    <span className="shrink-0 border-l-2 border-neutral-200 pl-3 text-[22px] leading-[1.3]">
                      {inits || "YN"}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      <div
        aria-labelledby={`${baseId}-tab-draw`}
        className="grid gap-4 pt-4 sm:grid-cols-[1fr_11rem]"
        hidden={tab !== "draw"}
        id={`${baseId}-panel-draw`}
        role="tabpanel"
      >
        <SignaturePad
          height={150}
          label="Signature"
          onChange={setSignaturePng}
        />
        <SignaturePad height={150} label="Initials" onChange={setInitialsPng} />
      </div>

      <p className="mt-5 rounded-[10px] border-2 border-line bg-raised p-3 text-xs text-ink">
        By selecting Adopt and Sign, I agree that the signature and initials
        will be the electronic representation of my signature and initials for
        all purposes when I use them on documents.
      </p>
    </Modal>
  );
}
