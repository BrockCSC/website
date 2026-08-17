import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { requireMember } from "@/lib/auth/session";
import { toStorableImage } from "@/lib/image-convert";
import { rateLimit } from "@/lib/rate-limit";
import {
  MAX_SOURCE_BYTES,
  MAX_UPLOAD_BYTES,
  sniffImageType,
  UPLOAD_ROOT,
  uploadNameFor,
} from "@/lib/uploads";
import { notAuthorized } from "@/lib/json";

export const POST = async (req: NextRequest) => {
  if (!(await requireMember(req))) return notAuthorized();
  const limited = rateLimit(req, "upload", 60, 60 * 60 * 1000);
  if (limited) return limited;

  // formData() buffers the whole body. Positive test so a missing length fails.
  const declaredLength = Number(req.headers.get("content-length"));
  if (!(declaredLength <= MAX_SOURCE_BYTES)) {
    return NextResponse.json(
      { error: "That file is larger than 25MB." },
      { status: 413 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size > MAX_SOURCE_BYTES) {
    return NextResponse.json(
      { error: "That file is larger than 25MB." },
      { status: 413 },
    );
  }

  // The bytes decide, never the name or the type the client claims.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImageType(bytes);
  const storeAsIs = sniffed !== null && bytes.byteLength <= MAX_UPLOAD_BYTES;

  const converted = storeAsIs ? null : await toStorableImage(bytes);
  if (!storeAsIs && !converted) {
    return NextResponse.json(
      { error: "That file is not an image we can read." },
      { status: 415 },
    );
  }

  const name = uploadNameFor(storeAsIs ? sniffed! : "image/webp");
  const target = join(UPLOAD_ROOT, name);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, converted ?? bytes);

  return NextResponse.json({ url: `/uploads/${name}` }, { status: 201 });
};
