import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "BrockCSC Sign" },
  robots: { index: false, follow: false },
};

export default function SignLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
