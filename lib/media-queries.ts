// Breakpoint vocabulary (spec D3). Each string is copied verbatim into the
// matching @custom-variant and @media blocks in app/globals.css; change them
// together. CSS handles layout; these are for behaviour only.
//
// React-free on purpose, so server components can import the constants. The
// hooks live in lib/use-media-query.ts ("use client").

/** Portrait phones below 768px, and landscape phones (coarse and ≤500px tall). */
export const PHONE_QUERY =
  "(max-width: 767.98px), (pointer: coarse) and (max-height: 500px)";

/** The complement of PHONE_QUERY: tablets and desktop windows from 768px. */
export const DESK_QUERY =
  "(min-width: 768px) and (pointer: fine), (min-width: 768px) and (min-height: 500.02px)";

/** Landscape phones: the compact, icons-only tab bar. */
export const SHORT_QUERY = "(pointer: coarse) and (max-height: 500px)";

export const COARSE_QUERY = "(pointer: coarse)";

/** Below Tailwind's lg (1024px). */
export const BELOW_LG = "(max-width: 1023.98px)";
