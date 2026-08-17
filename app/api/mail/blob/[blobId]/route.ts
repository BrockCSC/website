import { NextResponse, type NextRequest } from "next/server";
import { downloadBlob } from "@/lib/mail/jmap-mail";
import { mailToken, unauthorized } from "../../auth";

/** Anything a browser might execute in our origin is downgraded before it is
 * served back; every blob is a download, never an inline document. */
const RISKY = /html|xml|svg|javascript|ecmascript/i;
const TYPE = /^[\w.+-]+\/[\w.+-]+$/;

const safeType = (type: string) =>
  TYPE.test(type) && !RISKY.test(type) ? type : "application/octet-stream";

const safeName = (name: string) =>
  name
    .replace(/[\p{Cc}"\/]/gu, "_")
    .trim()
    .slice(0, 200) || "attachment";

/**
 * Proxies one JMAP blob. The user's Stalwart token stays server side; the
 * browser only ever sees this route.
 */
export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ blobId: string }> },
) => {
  const token = await mailToken(req);
  if (!token) return unauthorized();

  const search = new URL(req.url).searchParams;
  const name = safeName(search.get("name") ?? "attachment");
  const type = safeType(search.get("type") ?? "");
  const { blobId } = await params;

  const upstream = await downloadBlob(token, blobId, name, type).catch(
    () => null,
  );
  if (!upstream?.body) {
    return NextResponse.json({ error: "No such attachment" }, { status: 404 });
  }

  const length = upstream.headers.get("content-length");
  return new NextResponse(upstream.body, {
    headers: {
      "content-type": type,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      ...(length ? { "content-length": length } : {}),
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "private, no-store",
    },
  });
};
