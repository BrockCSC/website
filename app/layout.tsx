import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/ui/navbar";
import Footer from "@/components/ui/footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "BrockCSC",
    template: "%s | BrockCSC",
  },
  description:
    "Brock Computer Science Club events, resources, and community updates.",
  applicationName: "BrockCSC",
  keywords: ["BrockCSC", "Brock University", "Computer Science", "Club"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col antialiased`}
      >
        <div className="flex-1 bg-background text-[#1b1d1f]">
          <Navbar />
          <div className="mx-auto w-full max-w-[1060px] px-5">{children}</div>
        </div>
        <Footer />
      </body>
    </html>
  );
}
