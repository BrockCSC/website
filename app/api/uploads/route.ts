import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { requireMember } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import {
  isAllowedImageType,
  MAX_UPLOAD_BYTES,
  sniffImageType,
  UPLOAD_ROOT,
  uploadNameFor,
} from "@/lib/uploads";
import { notAuthorized } from "@/lib/json";

const tooLarge = () =>
  NextResponse.json(
    { error: "That image is larger than 5MB." },
    { status: 413 },
  );

export const POST = async (req: NextRequest) => {
  if (!(await requireMember(req))) return notAuthorized();
  const limited = rateLimit(req, "upload", 60, 60 * 60 * 1000);
  if (limited) return limited;

  // formData() buffers the whole body. Positive test so a missing length fails.
  const declaredLength = Number(req.headers.get("content-length"));
  if (!(declaredLength <= MAX_UPLOAD_BYTES)) return tooLarge();

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!isAllowedImageType(file.type)) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, WebP, GIF or AVIF images are allowed." },
      { status: 415 },
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) return tooLarge();

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (sniffImageType(bytes) !== file.type) {
    return NextResponse.json(
      { error: "That file is not the image type it claims to be." },
      { status: 415 },
    );
  }

  const name = uploadNameFor(file.type);
  const target = join(UPLOAD_ROOT, name);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);

  return NextResponse.json({ url: `/uploads/${name}` }, { status: 201 });
};
