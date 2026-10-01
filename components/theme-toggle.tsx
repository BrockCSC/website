"use client";

import { cn } from "@/lib/utils";

// The --surface value per theme (globals.css), mirrored in the pre-paint
// script in app/layout.tsx.
const THEME_COLOR = { light: "#ffffff", dark: "#1b181d" };

function syncThemeColor(dark: boolean) {
  let meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = dark ? THEME_COLOR.dark : THEME_COLOR.light;
}

export const setTheme = (theme: "light" | "dark") => {
  const dark = theme === "dark";
  document.documentElement.classList.toggle("dark", dark);
  syncThemeColor(dark);
  try {
    localStorage.setItem("brockcsc-theme", theme);
  } catch {}
};

export const flipTheme = () =>
  setTheme(
    document.documentElement.classList.contains("dark") ? "light" : "dark",
  );

export function ThemeToggle({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={flipTheme}
      title="Switch between light and dark"
      aria-label="Switch between light and dark"
      className={cn(
        "grid size-11 place-items-center rounded-[10px] border-2 border-line text-ink hover:bg-tint",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="size-4 dark:hidden"
      >
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="hidden size-4 dark:block"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
      </svg>
    </button>
  );
}
