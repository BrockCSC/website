"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ListTree } from "lucide-react";

import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const navItems = [
  { name: "Introduction", id: "introduction", indent: false },
  { name: "Course Registration", id: "registration", indent: false },
  { name: "Course Codes", id: "course-codes", indent: true },
  { name: "Common Course Types", id: "common-course-types", indent: true },
  { name: "Course Durations", id: "course-duration", indent: true },
  { name: "Sections", id: "course-sections", indent: true },
  { name: "Context Credits", id: "context-credits", indent: true },
  { name: "Program Requirements", id: "requirements", indent: false },
  { name: "Bachelor of Computer Science", id: "bachelor", indent: true },
  { name: "Minor in Applied Computing", id: "minor-computing", indent: true },
  { name: "Double Major", id: "double-major", indent: true },
  { name: "Courses", id: "courses", indent: true },
  {
    name: "Resources and Opportunities",
    id: "resources-opportunities",
    indent: false,
  },
  { name: "Resources", id: "resources", indent: true },
  { name: "Opportunities", id: "opportunities", indent: true },
];

/** The section crossing the middle of the viewport. */
function useActiveSection() {
  const [activeId, setActiveId] = useState("introduction");

  useEffect(() => {
    const targets = navItems
      .map((item) => document.getElementById(item.id))
      .filter((el) => el !== null);

    // has to be accumulated here.
    const crossing = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            crossing.set(entry.target.id, entry.boundingClientRect.top);
          } else {
            crossing.delete(entry.target.id);
          }
        }

        // precedence over its parent.
        const current = [...crossing.entries()].sort((a, b) => b[1] - a[1])[0];
        if (current) {
          setActiveId((prev) => (prev !== current[0] ? current[0] : prev));
        }
      },
      {
        rootMargin: "-50% 0px -50% 0px",
        threshold: 0,
      },
    );

    targets.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return [activeId, setActiveId] as const;
}

// Full-bleed inside the public container (its gutters include the
// landscape safe areas).
const bleed =
  "-mr-[max(1.25rem,env(safe-area-inset-right))] -ml-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pl-[max(1.25rem,env(safe-area-inset-left))]";

/**
 * Below lg: a sticky "current section" bar under the site header that opens
 * the table of contents as a sheet (public-5). Render it above the guide's
 * flex row, as the first child of <main>.
 */
export function GuideTocBar() {
  const [activeId, setActiveId] = useActiveSection();
  const [open, setOpen] = useState(false);
  const pendingRef = useRef<string | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  // Reading progress as a 2px brand hairline along the bar's bottom edge.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const root = document.documentElement;
      const max = root.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${progress})`;
      }
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const current = navItems.find((item) => item.id === activeId) ?? navItems[0];

  // The sheet holds the scroll lock until it has animated out, so the jump
  // waits for onExited.
  const jumpToPending = () => {
    const id = pendingRef.current;
    pendingRef.current = null;
    const target = id ? document.getElementById(id) : null;
    if (!id || !target) return;
    target.scrollIntoView({ block: "start" });
    setActiveId(id);
    const heading = target.querySelector<HTMLElement>("h1, h2, h3");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  };

  return (
    <div
      className={cn(
        "sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 -mt-10 mb-8 border-b-2 border-line bg-surface py-2 sm:-mt-16 md:top-0 lg:hidden",
        bleed,
      )}
      data-guide-toc=""
    >
      <button
        aria-haspopup="dialog"
        className="press-flat flex h-11 w-full items-center gap-3 rounded-[10px] px-2 text-left"
        onClick={() => setOpen(true)}
        type="button"
      >
        <ListTree aria-hidden="true" className="size-5 shrink-0 text-subtle" />
        <span className="min-w-0 flex-1 truncate font-bold text-ink">
          <span className="sr-only">Contents, current section: </span>
          {current.name}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-5 shrink-0 text-subtle"
        />
      </button>
      <div
        aria-hidden="true"
        className="absolute inset-x-0 -bottom-[2px] h-[2px] origin-left scale-x-0 bg-brand"
        ref={progressRef}
      />

      <Sheet
        bodyClassName="px-0 pt-1 pb-3 desk:px-0 desk:pb-4"
        onClose={() => setOpen(false)}
        onExited={jumpToPending}
        open={open}
        title="Contents"
      >
        <ul>
          {navItems.map((item) => {
            const active = item.id === activeId;
            return (
              <li key={item.id}>
                <a
                  aria-current={active ? "location" : undefined}
                  className={cn(
                    "press-flat relative flex items-center pr-4",
                    item.indent
                      ? "min-h-11 pl-9 text-[15px] text-subtle"
                      : "min-h-12 pl-4 text-base font-semibold text-ink",
                    active &&
                      "bg-tint font-bold text-ink before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-brand",
                  )}
                  href={`#${item.id}`}
                  onClick={(clickEvent) => {
                    clickEvent.preventDefault();
                    pendingRef.current = item.id;
                    setOpen(false);
                  }}
                >
                  {item.name}
                </a>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </div>
  );
}

/** The lg sidebar. Below lg the guide uses GuideTocBar instead. */
export default function Sidebar() {
  const [activeId, setActiveId] = useActiveSection();

  const activeStyle = "bg-brand text-brand-ink font-semibold";
  const defaultStyle =
    "bg-surface text-ink hover:translate-x-1 hover:translate-y-[1px] active:bg-tint";

  return (
    <aside
      className={`
        max-lg:hidden
        lg:block lg:sticky lg:top-24 lg:w-64 lg:h-fit shrink-0
        fixed inset-0 z-40 bg-surface transition-[transform,opacity,visibility] duration-[var(--dur-slow)] ease-smooth
        invisible translate-x-full opacity-0
        lg:visible lg:translate-x-0 lg:static lg:bg-transparent lg:opacity-100
        w-full md:w-80 ml-auto lg:ml-0
      `}
    >
      <nav
        aria-label="Guide sections"
        className={`
          space-y-2 p-6 pt-20 lg:p-0 lg:pt-0
          flex flex-col h-full overflow-y-auto overscroll-contain lg:overflow-visible
          justify-start
        `}
        id="guide-nav"
      >
        {navItems.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            onClick={() => setActiveId(item.id)}
            className={`
                    block rounded-xl border-2 border-line shadow-brut-sm text-center lg:text-left
                    ${
                      item.indent
                        ? "ml-6 w-[calc(100%-1.5rem)] text-sm px-2 py-1 my-1"
                        : "w-full px-4 py-4 lg:py-3 text-lg lg:text-base"
                    }
                    ${activeId === item.id ? activeStyle : defaultStyle}
                    `}
          >
            {item.name}
          </a>
        ))}
      </nav>
    </aside>
  );
}
