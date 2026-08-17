"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MessagePage } from "@/components/ui/message-page";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <MessagePage
      eyebrow="Something went wrong"
      title="This page didn't load."
      body="That's on us, not you. Try again, and if it keeps happening let an exec know on Discord."
    >
      <Button onClick={reset} size="lg">
        Try again
      </Button>
      <Button asChild size="lg" variant="outline">
        <Link href="/">Back to home</Link>
      </Button>
    </MessagePage>
  );
}
