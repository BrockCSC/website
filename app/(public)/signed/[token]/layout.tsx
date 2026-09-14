import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Completed document | BrockCSC Sign" },
  robots: { index: false, follow: false },
};

export default function SignedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
