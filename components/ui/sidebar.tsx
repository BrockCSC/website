"use client";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

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

export default function Sidebar() {
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

  const [isOpen, setIsOpen] = useState(false);

  const activeStyle = "bg-brand text-brand-ink font-semibold";
  const defaultStyle =
    "bg-surface text-ink hover:translate-x-1 hover:translate-y-[1px]";

  const toggleMenu = () => setIsOpen(!isOpen);

  const handleNavClick = (id: string) => {
    setActiveId(id);
    setIsOpen(false);
  };

  return (
    <>
      <button
        onClick={toggleMenu}
        aria-label={isOpen ? "Close guide navigation" : "Open guide navigation"}
        aria-expanded={isOpen}
        aria-controls="guide-nav"
        className={`lg:hidden fixed right-4 top-25 z-50 p-2.5 bg-surface text-ink border-2 border-line shadow-brut-sm rounded-xl ${
          isOpen ? "-translate-y-20" : ""
        }`}
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      <aside
        className={`
        lg:block lg:sticky lg:top-24 lg:w-64 lg:h-fit shrink-0
        fixed inset-0 z-40 bg-surface transition-[transform,opacity,visibility] duration-[var(--dur-slow)] ease-smooth
        ${isOpen ? "visible translate-x-0 opacity-100" : "invisible translate-x-full opacity-0"}
        lg:visible lg:translate-x-0 lg:static lg:bg-transparent lg:opacity-100
        w-full md:w-80 ml-auto lg:ml-0
      `}
      >
        <nav
          id="guide-nav"
          className={`
          space-y-2 p-6 pt-20 lg:p-0 lg:pt-0
          flex flex-col h-full overflow-y-auto overscroll-contain lg:overflow-visible
          ${isOpen ? "items-center" : ""} justify-start
        `}
        >
          {navItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={() => handleNavClick(item.id)}
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

      <div
        aria-hidden="true"
        className={`fixed inset-0 z-30 bg-black/50 transition-opacity duration-[var(--dur-slow)] ease-smooth lg:hidden ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={toggleMenu}
      />
    </>
  );
}
