import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MessagePage } from "@/components/ui/message-page";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <MessagePage
      eyebrow="404"
      title="That page isn't here."
      body="The link may be out of date, or the page may have moved. These still work:"
    >
      <Button asChild size="lg">
        <Link href="/">Back to home</Link>
      </Button>
      <Button asChild size="lg" variant="outline">
        <Link href="/events">See events</Link>
      </Button>
    </MessagePage>
  );
}
