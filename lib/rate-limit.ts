import { NextResponse, type NextRequest } from "next/server";

/**
 * Fixed-window limiter kept in process memory. Each environment runs a single
 * container, so a shared store would be more moving parts than it is worth.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

/** Traefik appends the peer it saw, so the last hop is the one a client cannot forge. */
const clientIp = (req: NextRequest): string => {
  const chain = req.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return chain?.at(-1) ?? req.headers.get("x-real-ip") ?? "unknown";
};

export const rateLimit = (
  req: NextRequest,
  bucket: string,
  limit: number,
  windowMs: number,
): NextResponse | null => {
  const key = `${bucket}:${clientIp(req)}`;
  const now = Date.now();
  const window = windows.get(key);

  if (!window || now >= window.resetAt) {
    if (windows.size > 10_000) {
      for (const [k, v] of windows) {
        if (now >= v.resetAt) windows.delete(k);
      }
    }
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  window.count += 1;
  if (window.count > limit) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      {
        status: 429,
        headers: {
          "retry-after": String(Math.ceil((window.resetAt - now) / 1000)),
        },
      },
    );
  }
  return null;
};
