import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/signup"],
    },
    sitemap: "https://brockcsc.ca/sitemap.xml",
  };
}
