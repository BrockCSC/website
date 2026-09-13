import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";

const STEPS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  Home: -Infinity,
  End: Infinity,
};

const useTapOutside = (
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
) => {
  useEffect(() => {
    if (!open) return;
    const onDown = (event: globalThis.PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [ref, open, close]);
};

/** Snaps to the nearest of `count` evenly spaced points across the element. */
export const useCrosshair = (count: number) => {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ index: count - 1, visible: false });
  const hide = useCallback(
    () =>
      setState((prev) => (prev.visible ? { ...prev, visible: false } : prev)),
    [],
  );
  useTapOutside(ref, state.visible, hide);

  const last = Math.max(count - 1, 0);
  const index = Math.min(Math.max(state.index, 0), last);

  const track = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = rect.width ? (event.clientX - rect.left) / rect.width : 0;
    const next = Math.round(Math.min(Math.max(fraction, 0), 1) * last);
    setState((prev) =>
      prev.visible && prev.index === next
        ? prev
        : { index: next, visible: true },
    );
  };

  return {
    index,
    visible: state.visible,
    bind: {
      ref,
      tabIndex: 0,
      onPointerDown: track,
      onPointerMove: track,
      onPointerLeave: (event: PointerEvent<HTMLDivElement>) => {
        if (event.pointerType === "mouse") hide();
      },
      onPointerCancel: hide,
      onBlur: hide,
      onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") return hide();
        const step = STEPS[event.key];
        if (step === undefined) return;
        event.preventDefault();
        const from = state.visible ? index : step < 0 ? last + 1 : -1;
        setState({
          index: Math.min(Math.max(from + step, 0), last),
          visible: true,
        });
      },
    },
  };
};

/** Tracks which of a set of marks is hovered, tapped or focused. */
export const useHighlight = <T extends HTMLElement>() => {
  const ref = useRef<T>(null);
  const [active, setActive] = useState<number | null>(null);
  const clear = useCallback(() => setActive(null), []);
  useTapOutside(ref, active !== null, clear);

  const target = (index: number) => ({
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType === "mouse") setActive(index);
    },
    onPointerLeave: (event: PointerEvent) => {
      if (event.pointerType === "mouse") clear();
    },
    onPointerDown: () => setActive(index),
    onFocus: () => setActive(index),
    onBlur: clear,
  });

  return { ref, active, target };
};
