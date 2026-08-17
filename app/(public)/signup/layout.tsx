import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Request an account",
  description:
    "Request a BrockCSC exec account with an invite code from a current exec. A co-president approves it by hand.",
};

export default function SignupLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
