"use client";

import { useEffect, useState } from "react";
import type { MessageDetail } from "@/lib/mail/jmap-mail";

const addressLine = (list: MessageDetail["from"]) =>
  (list ?? []).map((a) => a.name || a.email).join(", ");

export function MessageView({ id }: { id: string }) {
  const [message, setMessage] = useState<MessageDetail | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const path = `/api/mail/messages/${encodeURIComponent(id)}`;
    Promise.all([
      fetch(path).then((res) =>
        res.ok ? res.json() : Promise.reject(res.status),
      ),
      fetch(`${path}/body`).then((res) =>
        res.ok ? res.text() : Promise.reject(res.status),
      ),
    ])
      .then(([detail, html]) => {
        if (!live) return;
        setMessage(detail);
        setBody(html);
      })
      .catch(() => live && setError("Could not load this message."));
    return () => {
      live = false;
    };
  }, [id]);

  if (error) {
    return <p className="p-6 text-sm text-[#9A4440]">{error}</p>;
  }
  if (!message) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <article className="flex h-full flex-col">
      <header className="border-b-2 border-black px-5 py-4">
        <h2 className="text-lg font-extrabold text-[#9A4440]">
          {message.subject || "(no subject)"}
        </h2>
        <p className="mt-1 text-sm font-bold">{addressLine(message.from)}</p>
        <p className="text-xs text-muted-foreground">
          to {addressLine(message.to) || "undisclosed recipients"} ·{" "}
          {new Date(message.receivedAt).toLocaleString()}
        </p>
      </header>

      {/* Sandboxed: the body is untrusted even after sanitising. srcdoc rather
          than src so the app's own X-Frame-Options cannot block it. */}
      <iframe
        title="Message body"
        srcDoc={body}
        sandbox=""
        referrerPolicy="no-referrer"
        className="w-full flex-1 border-0 bg-white"
      />
    </article>
  );
}
