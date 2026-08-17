/** Renders before the navbar; the target is the page's `#main-content`. */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-100 focus:rounded-[10px] focus:border-2 focus:border-line focus:bg-surface focus:px-4 focus:py-2 focus:font-bold focus:text-ink"
    >
      Skip to content
    </a>
  );
}
