import { NextResponse, type NextRequest } from "next/server";

/** Fixed-window limiter in process memory; one container per environment. */
const windows = new Map<string, { count: number; resetAt: number }>();
const MAX_WINDOWS = 10_000;

/** Last hop only: earlier entries are client-supplied. */
const clientIp = (req: NextRequest): string => {
  const chain = req.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return chain?.at(-1) ?? req.headers.get("x-real-ip") ?? "unknown";
};

/** Counts per caller IP unless `identity` names something else to count by. */
export const rateLimit = (
  req: NextRequest,
  bucket: string,
  limit: number,
  windowMs: number,
  identity?: string,
): NextResponse | null => {
  const key = `${bucket}:${identity ?? clientIp(req)}`;
  const now = Date.now();
  const window = windows.get(key);

  if (!window || now >= window.resetAt) {
    if (windows.size > MAX_WINDOWS) {
      for (const [k, v] of windows) {
        if (now >= v.resetAt) windows.delete(k);
      }
      // Sweeping frees only expired windows; evict oldest-first for the rest.
      for (const k of windows.keys()) {
        if (windows.size <= MAX_WINDOWS) break;
        windows.delete(k);
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
