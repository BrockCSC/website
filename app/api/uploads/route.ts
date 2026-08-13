import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import {
  isAllowedImageType,
  MAX_UPLOAD_BYTES,
  UPLOAD_ROOT,
  uploadNameFor,
} from "@/lib/uploads";

export const POST = async (req: NextRequest) => {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

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
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "That image is larger than 5MB." },
      { status: 413 },
    );
  }

  const name = uploadNameFor(file.type);
  const target = join(UPLOAD_ROOT, name);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await file.arrayBuffer()));

  return NextResponse.json({ url: `/uploads/${name}` }, { status: 201 });
};
