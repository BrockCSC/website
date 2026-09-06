import { NextResponse, type NextRequest } from "next/server";
import { uploadBlob } from "@/lib/mail/jmap-mail";
import { mailWriter } from "../auth";

const MAX_BYTES = 15 * 1024 * 1024;

export const POST = async (req: NextRequest) => {
  const scope = await mailWriter(req);
  if (scope instanceof NextResponse) return scope;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Attach one file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Files must be under ${MAX_BYTES / 1024 / 1024} MB` },
      { status: 413 },
    );
  }

  const type = file.type || "application/octet-stream";
  try {
    const blob = await uploadBlob(scope.access, await file.arrayBuffer(), type);
    return NextResponse.json({
      ...blob,
      type,
      name: file.name || "attachment",
    });
  } catch {
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }
};
