import { NextResponse } from "next/server";

/** Null unless the body parsed as an object, so routes can answer 400. */
export const jsonObject = async <T>(req: Request): Promise<T | null> => {
  const body: unknown = await req.json().catch(() => null);
  return body && typeof body === "object" ? (body as T) : null;
};

export const badJson = () =>
  NextResponse.json({ error: "Expected a JSON object." }, { status: 400 });
