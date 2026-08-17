"use client";

import "./globals.css";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-5 bg-surface px-5 text-center text-ink antialiased">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-brand">
          BrockCSC
        </p>
        <h1 className="text-3xl font-black">The site hit an error.</h1>
        <p className="text-subtle">
          Reloading usually fixes it. If it doesn&apos;t, let an exec know on
          Discord.
        </p>
        <button
          className="rounded-[16px] border-2 border-line bg-brand px-7 py-2.5 font-semibold text-brand-ink shadow-brut-sm"
          onClick={reset}
          type="button"
        >
          Reload
        </button>
      </body>
    </html>
  );
}
