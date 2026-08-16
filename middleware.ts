import { NextResponse, type NextRequest } from "next/server";

/**
 * Splits the authenticated surface onto its own hostname. One codebase and one
 * deploy, but admin.* only ever serves signed-in pages and the public site
 * never serves them, so there is a single place to sign in.
 */
const ADMIN_HOST = process.env.ADMIN_SUBDOMAIN ?? "";

const isAdminHost = (host: string) =>
  ADMIN_HOST !== "" && host.split(":")[0] === ADMIN_HOST.split(":")[0];

export const middleware = (req: NextRequest) => {
  const host = req.headers.get("host") ?? "";
  const { pathname, search } = req.nextUrl;

  if (isAdminHost(host)) {
    if (pathname === "/") {
      return NextResponse.rewrite(new URL("/admin", req.url));
    }
    // Public pages stay on the public site so there is one canonical copy.
    if (/^\/(events|team|links|cs-guide)(\/|$)/.test(pathname)) {
      const site = process.env.PUBLIC_SUBDOMAIN;
      if (site) {
        return NextResponse.redirect(
          `https://${site}${pathname}${search}`,
          308,
        );
      }
    }
    return NextResponse.next();
  }

  if (ADMIN_HOST && /^\/admin(\/|$)/.test(pathname)) {
    return NextResponse.redirect(
      `https://${ADMIN_HOST}${pathname}${search}`,
      308,
    );
  }
  return NextResponse.next();
};

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|uploads).*)"],
};
