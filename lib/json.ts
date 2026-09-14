import { NextResponse } from "next/server";

/** Null unless the body parsed as an object, so routes can answer 400. */
export const jsonObject = async <T>(req: Request): Promise<T | null> => {
  const body: unknown = await req.json().catch(() => null);
  return body && typeof body === "object" ? (body as T) : null;
};

/**
 * jsonObject with a byte cap enforced while reading, so a body with no
 * Content-Length (chunked) can't be buffered whole before anything checks it.
 */
export const jsonObjectWithin = async <T>(
  req: Request,
  maxBytes: number,
): Promise<{ body: T | null; tooLarge: boolean }> => {
  if (Number(req.headers.get("content-length")) > maxBytes) {
    return { body: null, tooLarge: true };
  }
  if (!req.body) return { body: null, tooLarge: false };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        return { body: null, tooLarge: true };
      }
      chunks.push(value);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return {
      body: body && typeof body === "object" ? (body as T) : null,
      tooLarge: false,
    };
  } catch {
    return { body: null, tooLarge: false };
  }
};

export const badJson = () =>
  NextResponse.json({ error: "Expected a JSON object." }, { status: 400 });

export const notAuthorized = () =>
  NextResponse.json({ error: "Not authorized" }, { status: 401 });

export const notFound = () =>
  NextResponse.json({ error: "Not found" }, { status: 404 });
