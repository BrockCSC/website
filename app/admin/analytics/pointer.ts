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

/** A touch or pen has to move this far sideways before it scrubs. */
const INTENT_PX = 6;

/**
 * Snaps to one of `count` points across the element: evenly spaced edge to
 * edge ("points", a line chart), or the centres of `count` equal slots
 * ("slots", a bar chart).
 *
 * Touch and pen don't show anything on pointerdown, so a vertical scroll
 * that starts on the chart never flashes the crosshair (dash-7). Scrubbing
 * starts on the first clearly horizontal move; a tap without a scroll (no
 * pointercancel) shows the point under the finger.
 */
export const useCrosshair = (
  count: number,
  layout: "points" | "slots" = "points",
) => {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ index: count - 1, visible: false });
  // The touch in progress: where it went down, and whether it's scrubbing.
  const touch = useRef<{ x: number; y: number; scrubbing: boolean } | null>(
    null,
  );
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
    const fraction = Math.min(
      Math.max(rect.width ? (event.clientX - rect.left) / rect.width : 0, 0),
      1,
    );
    const next =
      layout === "slots"
        ? Math.min(Math.floor(fraction * count), last)
        : Math.round(fraction * last);
    setState((prev) =>
      prev.visible && prev.index === next
        ? prev
        : { index: next, visible: true },
    );
  };

  const cancel = () => {
    touch.current = null;
    hide();
  };

  return {
    index,
    visible: state.visible,
    bind: {
      ref,
      tabIndex: 0,
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (event.pointerType === "mouse") return track(event);
        touch.current = {
          x: event.clientX,
          y: event.clientY,
          scrubbing: false,
        };
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        if (event.pointerType === "mouse") return track(event);
        const current = touch.current;
        if (!current) return;
        if (!current.scrubbing) {
          const dx = Math.abs(event.clientX - current.x);
          const dy = Math.abs(event.clientY - current.y);
          if (dx <= INTENT_PX || dx <= dy) return;
          current.scrubbing = true;
        }
        track(event);
      },
      onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
        if (event.pointerType === "mouse") return;
        const current = touch.current;
        touch.current = null;
        // A tap: the browser never took it over for scrolling.
        if (current && !current.scrubbing) track(event);
      },
      onPointerLeave: (event: PointerEvent<HTMLDivElement>) => {
        if (event.pointerType === "mouse") hide();
      },
      onPointerCancel: cancel,
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
