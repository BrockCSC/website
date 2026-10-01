"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { announce } from "@/lib/announce";
import type { SignatureFontId } from "@/lib/api/types";
import { SIGNATURE_FONTS } from "@/lib/documents/fields";
import { useCoarsePointer } from "@/lib/use-media-query";
import { initialsFrom, type AdoptedDraft } from "./adopted";
import { Modal } from "./modal";
import { readPads, writePads, type SavedPads } from "./progress";
import { SIGNATURE_FONT_FAMILY, SIGNATURE_INK } from "./signature-fonts";
import {
  PadCanvas,
  PadPaper,
  SignaturePad,
  type Stroke,
} from "./signature-pad";

type Tab = "style" | "draw";
type Mark = "signature" | "initials";

const inputClass =
  "w-full rounded-[10px] border-2 border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-subtle focus:border-brand pointer-fine:text-sm";

const MARK_LABEL: Record<Mark, string> = {
  signature: "Signature",
  initials: "Initials",
};

const EMPTY_PAD = { strokes: [] as Stroke[], png: null as string | null };

/**
 * Touch screens: one mark at a time on a full-screen pad. The canvas is inset
 * 32px from the screen edges inside a bordered area, so a stroke never starts
 * in Android's back-gesture zone. Closing it any way keeps the strokes; only
 * Clear erases.
 */
function PadSheet({
  mark,
  strokesFor,
  onStrokesChange,
  onPng,
  onClose,
}: {
  mark: Mark | null;
  strokesFor: (mark: Mark) => Stroke[];
  onStrokesChange: (mark: Mark, strokes: Stroke[]) => void;
  onPng: (mark: Mark, png: string | null) => void;
  onClose: () => void;
}) {
  // The last mark shown, so the pad keeps its ink while it animates out.
  const [shown, setShown] = useState<Mark>(mark ?? "signature");
  if (mark && mark !== shown) setShown(mark);
  const strokes = strokesFor(shown);
  return (
    <Sheet
      bodyClassName="flex flex-col px-8 pt-4 pb-4"
      footer={
        <div className="grid grid-cols-3 gap-3">
          <Button
            className="h-12"
            disabled={!strokes.length}
            onClick={() => onStrokesChange(shown, [])}
            type="button"
            variant="outline"
          >
            Clear
          </Button>
          <Button
            className="h-12"
            disabled={!strokes.length}
            onClick={() => onStrokesChange(shown, strokes.slice(0, -1))}
            type="button"
            variant="outline"
          >
            Undo
          </Button>
          <Button className="h-12" onClick={onClose} type="button">
            Done
          </Button>
        </div>
      }
      onClose={onClose}
      open={mark != null}
      presentation="full"
      title={
        shown === "initials" ? "Draw your initials" : "Draw your signature"
      }
    >
      <p className="text-center text-sm text-subtle">
        Turn your phone sideways for more room.
      </p>
      <PadPaper className="mt-3 min-h-32 flex-1" empty={!strokes.length}>
        <PadCanvas
          key={shown}
          label={MARK_LABEL[shown]}
          lineWidth={3}
          onPng={(png) => onPng(shown, png)}
          onStrokesChange={(next) => onStrokesChange(shown, next)}
          strokes={strokes}
        />
      </PadPaper>
    </Sheet>
  );
}

export function AdoptSignatureModal({
  defaultName,
  current,
  storageKey,
  onAdopt,
  onClose,
}: {
  defaultName: string;
  current: AdoptedDraft | null;
  /** Keeps drawn strokes across a close, a reload or a back (sessionStorage). */
  storageKey?: string;
  onAdopt: (adopted: AdoptedDraft) => void;
  onClose: () => void;
}) {
  const baseId = useId();
  const coarse = useCoarsePointer();
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
  const [pads, setPads] = useState<SavedPads>(() => {
    const saved = storageKey ? readPads(storageKey) : null;
    if (saved) return saved;
    if (current?.style === "drawn") {
      return {
        signature: { strokes: [], png: current.signaturePng ?? null },
        initials: { strokes: [], png: current.initialsPng ?? null },
      };
    }
    return {};
  });
  const [padOpen, setPadOpen] = useState<Mark | null>(null);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({
    style: null,
    draw: null,
  });

  useEffect(() => {
    if (storageKey) writePads(storageKey, pads);
  }, [pads, storageKey]);

  const pad = (mark: Mark) => pads[mark] ?? EMPTY_PAD;
  const setPad = (mark: Mark, patch: Partial<typeof EMPTY_PAD>) =>
    setPads((prev) => ({
      ...prev,
      [mark]: { ...(prev[mark] ?? EMPTY_PAD), ...patch },
    }));
  const signaturePng = pad("signature").png;
  const initialsPng = pad("initials").png;

  const name = fullName.trim();
  const inits = initials.trim();
  const blocker = !name
    ? "Enter your full name to continue"
    : !inits
      ? "Enter your initials to continue"
      : tab === "draw" && !signaturePng
        ? "Draw your signature to continue"
        : tab === "draw" && !initialsPng
          ? "Draw your initials to continue"
          : null;
  const ready = !blocker;
  const statusId = `${baseId}-status`;

  const adopt = () => {
    if (blocker) {
      announce(blocker);
      return;
    }
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
          <Button
            aria-describedby={blocker ? statusId : undefined}
            aria-disabled={ready ? undefined : true}
            className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            onClick={adopt}
            size="sm"
            type="button"
          >
            Adopt and Sign
          </Button>
        </>
      }
      footerNote={
        blocker && (
          <p
            className="mb-3 text-sm font-bold text-subtle desk:text-right"
            id={statusId}
          >
            {blocker}
          </p>
        )
      }
      onClose={onClose}
      size="lg"
      title="Adopt your signature"
    >
      <p className="text-[15px] text-subtle sm:text-sm">
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
            autoCapitalize="words"
            autoComplete="name"
            className={inputClass}
            data-autofocus
            enterKeyHint="next"
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
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            className={inputClass}
            enterKeyHint="done"
            id={`${baseId}-initials`}
            maxLength={5}
            onChange={(e) => {
              initialsTouched.current = true;
              setInitials(e.target.value);
            }}
            spellCheck={false}
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
            className={`-mb-0.5 rounded-t-[10px] border-2 px-4 py-2 text-sm font-bold pointer-coarse:min-h-11 ${
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
        className={
          coarse
            ? "flex flex-col gap-3 pt-4"
            : "grid gap-4 pt-4 sm:grid-cols-[1fr_11rem]"
        }
        hidden={tab !== "draw"}
        id={`${baseId}-panel-draw`}
        role="tabpanel"
      >
        {coarse
          ? (["signature", "initials"] as const).map((mark) => {
              const png = pad(mark).png;
              return (
                <button
                  aria-label={`${MARK_LABEL[mark]}: ${png ? "drawn. Tap to change it" : "not drawn yet. Tap to draw"}`}
                  className="press-flat flex w-full flex-col gap-1.5 rounded-[12px] border-2 border-line p-2 text-left"
                  key={mark}
                  onClick={() => setPadOpen(mark)}
                  type="button"
                >
                  <span className="flex w-full items-center justify-between px-1 text-sm font-bold text-ink">
                    {MARK_LABEL[mark]}
                    <span className="text-subtle">{png ? "Change" : null}</span>
                  </span>
                  <span className="flex h-16 w-full items-center justify-center overflow-hidden rounded-[8px] border-2 border-neutral-200 bg-white">
                    {png ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a local data URL the signer just drew.
                      <img
                        alt=""
                        className="max-h-14 max-w-full object-contain"
                        src={png}
                      />
                    ) : (
                      <span className="text-sm font-semibold text-neutral-500">
                        Tap to draw
                      </span>
                    )}
                  </span>
                </button>
              );
            })
          : (["signature", "initials"] as const).map((mark) => (
              <SignaturePad
                height={150}
                key={mark}
                label={MARK_LABEL[mark]}
                onChange={(png) => setPad(mark, { png })}
                onStrokesChange={(strokes) => setPad(mark, { strokes })}
                strokes={pad(mark).strokes}
              />
            ))}
      </div>

      <p className="mt-5 rounded-[10px] border-2 border-line bg-raised p-3 text-xs text-ink">
        By selecting Adopt and Sign, I agree that the signature and initials
        will be the electronic representation of my signature and initials for
        all purposes when I use them on documents.
      </p>

      {coarse && (
        <PadSheet
          mark={padOpen}
          onClose={() => setPadOpen(null)}
          onPng={(mark, png) => setPad(mark, { png })}
          onStrokesChange={(mark, strokes) => setPad(mark, { strokes })}
          strokesFor={(mark) => pad(mark).strokes}
        />
      )}
    </Modal>
  );
}
