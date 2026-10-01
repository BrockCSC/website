// Auto-fit for wide HTML email bodies (spec D13), run from the parent on the
// sandboxed iframe. The frame has allow-same-origin but never allow-scripts,
// so the parent can measure and style its document while nothing inside it
// can run.
//
// `zoom` rather than `transform: scale()`: zoom reflows, so the height,
// wrapping and link hit areas all follow the scaled layout. It goes on
// <body>, not <html>, whose zoom handling has been inconsistent.

/** Below this, 13px text drops to about 7px; wider bodies pan inside the frame instead. */
export const MIN_ZOOM = 0.55;

/** The visible side gutter of a fitted body, in CSS px. */
const GUTTER = 16;

export type FitResult = {
  /** Content width at zoom 1. */
  natural: number;
  /** The frame's width. */
  avail: number;
  /** The zoom applied (1 when nothing was scaled). */
  scale: number;
  /** The body is wider than the frame at zoom 1, so fitting changes something. */
  wide: boolean;
  /** Even at MIN_ZOOM it's wider than the frame: the frame's root scrolls sideways. */
  clamped: boolean;
};

/** Undo everything fitEmail set. Returns true when something was set. */
export function unfitEmail(iframe: HTMLIFrameElement): boolean {
  const doc = iframe.contentDocument;
  const body = doc?.body;
  if (!doc || !body) return false;
  const changed = Boolean(body.style.zoom || body.style.paddingLeft);
  body.style.zoom = "";
  body.style.paddingLeft = "";
  body.style.paddingRight = "";
  doc.documentElement.style.overflowX = "";
  return changed;
}

/**
 * Scales a wide body down to the frame's width (fit), or back to its
 * original size. Plain-text and responsive bodies (natural <= avail + 1)
 * are left alone. Returns null until the frame's document exists.
 */
export function fitEmail(
  iframe: HTMLIFrameElement,
  fit: boolean,
): FitResult | null {
  const doc = iframe.contentDocument;
  const body = doc?.body;
  const root = doc?.documentElement;
  if (!doc || !body || !root) return null;

  // Reset before measuring.
  unfitEmail(iframe);

  const measure = () => Math.max(root.scrollWidth, body.scrollWidth);
  let natural = measure();
  const avail = iframe.clientWidth;
  if (!avail) return null;
  const wide = natural > avail + 1;

  if (!(fit && wide)) {
    // Plain and responsive bodies, or Original size: the route's own
    // padding stays, and a body wider than the frame pans inside it.
    root.style.overflowX = wide ? "auto" : "hidden";
    return { natural, avail, scale: 1, wide, clamped: false };
  }

  // Measure the content without the body's gutter, then scale it into what
  // is left of the frame after a real 16px gutter on each side. The padding
  // is set in the body's own (zoomed) px, so it renders at GUTTER px: text
  // outside the email's tables (quoted replies, signatures) never touches
  // the screen edge, and the content sits centred.
  body.style.paddingLeft = "0px";
  body.style.paddingRight = "0px";
  natural = measure();
  const scale = Math.min(1, Math.max(MIN_ZOOM, (avail - 2 * GUTTER) / natural));
  body.style.paddingLeft = `${GUTTER / scale}px`;
  body.style.paddingRight = `${GUTTER / scale}px`;
  if (scale !== 1) body.style.zoom = String(scale);

  // Computed rather than re-measured: scrollWidth under zoom is unreliable.
  const overflows = natural * scale + 2 * GUTTER > avail + 1;
  // A clamped body pans inside the frame, never the page.
  root.style.overflowX = overflows ? "auto" : "hidden";

  return { natural, avail, scale, wide, clamped: overflows };
}
