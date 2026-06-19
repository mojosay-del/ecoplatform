import type { MetadataRoute } from "next";
import { absoluteSiteUrl } from "../src/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/account/",
        "/notifications",
        "/login",
        "/register",
        "/forgot-password",
        "/marketplace/new",
        "/marketplace/my",
        "/marketplace/offers",
        "/marketplace/*/edit",
      ],
    },
    sitemap: absoluteSiteUrl("/sitemap.xml"),
  };
}
