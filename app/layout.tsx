import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The --surface value per theme (globals.css). Duplicated in
// components/theme-toggle.tsx: a server file can't import values from a
// "use client" module.
const THEME_COLOR = { light: "#ffffff", dark: "#1b181d" };

const DESCRIPTION =
  "Brock Computer Science Club events, resources, and community updates.";

export const metadata: Metadata = {
  metadataBase: new URL("https://brockcsc.ca"),
  title: {
    default: "BrockCSC",
    template: "%s | BrockCSC",
  },
  description: DESCRIPTION,
  applicationName: "BrockCSC",
  keywords: ["BrockCSC", "Brock University", "Computer Science", "Club"],
  openGraph: {
    type: "website",
    siteName: "BrockCSC",
    title: "BrockCSC",
    description: DESCRIPTION,
    url: "/",
    locale: "en_CA",
  },
  twitter: { card: "summary_large_image" },
  // apple-touch-icon comes from app/apple-icon.png.
  // capable: false, because Next otherwise emits mobile-web-app-capable=yes,
  // and standalone mode waits for the manifest (spec D12).
  appleWebApp: { title: "BrockCSC", capable: false },
};

// viewportFit: "cover" lets fixed headers/footers extend under a notch or
// dynamic island, so their own safe-area-inset padding (rather than the
// browser reserving a blank bar) is what keeps content clear of it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Before paint, so a dark reader never sees a white flash. Light is
            the default: the class is added only when it was chosen. The
            theme-color meta (the --surface value, kept in sync by the theme
            toggle) is created here rather than rendered by React, so it can
            never cause a hydration mismatch. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var d=false;try{d=localStorage.getItem("brockcsc-theme")==="dark"}catch(e){}if(d)document.documentElement.classList.add("dark");var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement("meta");m.name="theme-color";document.head.appendChild(m)}m.content=d?"${THEME_COLOR.dark}":"${THEME_COLOR.light}"})()`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-svh flex-col antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
