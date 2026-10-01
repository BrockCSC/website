"use client";

import { Geist } from "next/font/google";
import { useLayoutEffect } from "react";
import { setTheme } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import "./globals.css";

// This page replaces the root layout, so it brings its own font variable,
// viewport and theme handling.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

// The --surface value per theme, as in app/layout.tsx.
const THEME_COLOR = { light: "#ffffff", dark: "#1b181d" };

// The root layout's pre-paint script. It only runs when this page is
// server-rendered; the layout effect below covers a crash on the client.
const THEME_SCRIPT = `(function(){var d=false;try{d=localStorage.getItem("brockcsc-theme")==="dark"}catch(e){}if(d)document.documentElement.classList.add("dark");var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement("meta");m.name="theme-color";document.head.appendChild(m)}m.content=d?"${THEME_COLOR.dark}":"${THEME_COLOR.light}"})()`;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // React swaps in this page's own <html>, which drops the class the
  // pre-paint script set. Put the stored theme back before paint.
  useLayoutEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("brockcsc-theme");
    } catch {}
    if (stored === "dark") setTheme("dark");
    else {
      document.documentElement.classList.remove("dark");
      const meta = document.querySelector<HTMLMetaElement>(
        'meta[name="theme-color"]',
      );
      if (meta) meta.content = THEME_COLOR.light;
    }
  }, []);

  useLayoutEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <title>Something went wrong | BrockCSC</title>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body
        className={`${geistSans.variable} flex min-h-svh flex-col items-center justify-center gap-5 bg-surface pt-[max(1.25rem,env(safe-area-inset-top))] pr-[max(1.25rem,env(safe-area-inset-right))] pb-[max(1.25rem,env(safe-area-inset-bottom))] pl-[max(1.25rem,env(safe-area-inset-left))] text-center text-ink antialiased`}
      >
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-brand">
          BrockCSC
        </p>
        <h1 className="text-3xl font-black">The site hit an error.</h1>
        <p className="max-w-[40ch] text-subtle">
          Reloading usually fixes it. If it doesn&apos;t, let an exec know on
          Discord.
        </p>
        <Button onClick={reset} size="lg">
          Reload
        </Button>
      </body>
    </html>
  );
}
