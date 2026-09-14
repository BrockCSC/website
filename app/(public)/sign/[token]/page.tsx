"use client";

import { useParams } from "next/navigation";
import { TokenSigningFlow } from "@/components/documents/signing/signing-flow";

export default function SignPage() {
  const token = (useParams().token as string) ?? "";
  return <TokenSigningFlow key={token} token={token} />;
}
