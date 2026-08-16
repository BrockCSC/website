import { type NextRequest } from "next/server";
import { subscribeToRoleChanges } from "@/lib/auth/role-events";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

/** Signals one signed-in user that their roles moved. Carries no payload. */
export const GET = (req: NextRequest) => {
  const user = getSessionUser(req);
  if (!user) return new Response("Not authenticated", { status: 401 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const send = (chunk: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          open = false;
        }
      };

      send(": connected\n\n");
      const unsubscribe = subscribeToRoleChanges(user.sub, () =>
        send("event: roles\ndata: changed\n\n"),
      );
      // Stops a proxy culling an idle stream; EventSource ignores it.
      const beat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);

      req.signal.addEventListener("abort", () => {
        open = false;
        clearInterval(beat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the disconnect.
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
};
