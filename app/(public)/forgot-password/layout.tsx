import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Forgot password",
  description: "Get a link to reset your BrockCSC exec account password.",
};

export default function ForgotPasswordLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
