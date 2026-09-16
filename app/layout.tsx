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
            the default: the class is added only when it was chosen. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("brockcsc-theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
