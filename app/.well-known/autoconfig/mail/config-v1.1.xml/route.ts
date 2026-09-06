import type { NextRequest } from "next/server";
import { fromStalwart } from "../../../stalwart";

export const dynamic = "force-dynamic";

export const GET = (req: NextRequest) => {
  const address = req.nextUrl.searchParams.get("emailaddress");
  return fromStalwart(
    `/mail/config-v1.1.xml${address ? `?emailaddress=${encodeURIComponent(address)}` : ""}`,
  );
};
