import { describe, expect, it } from "vitest";
import { absoluteSiteUrl, buildSitemapEntries, createPageMetadata, normalizeSiteUrl, titleWithSiteName } from "./seo";

describe("seo helpers", () => {
  it("normalizes site URLs and falls back to production origin", () => {
    expect(normalizeSiteUrl("https://ecoplatform.pro/some/path")).toBe("https://ecoplatform.pro");
    expect(normalizeSiteUrl("not-a-url")).toBe("https://ecoplatform.pro");
  });

  it("builds canonical metadata with site title and OG image fallback", () => {
    const metadata = createPageMetadata({
      title: "Новости",
      description: "Новости рынка вторсырья.",
      path: "/news/",
    });

    expect(metadata.title).toBe("Новости · ЭкоПлатформа");
    expect(metadata.alternates?.canonical).toBe("/news");
    expect(metadata.openGraph).toMatchObject({
      url: absoluteSiteUrl("/news"),
      images: [{ url: absoluteSiteUrl("/brand/logo.webp"), alt: "ЭкоПлатформа" }],
    });
  });

  it("does not duplicate the site name in titles", () => {
    expect(titleWithSiteName("ЭкоПлатформа")).toBe("ЭкоПлатформа");
    expect(titleWithSiteName("Новости · ЭкоПлатформа")).toBe("Новости · ЭкоПлатформа");
  });

  it("combines static routes and dynamic SEO entries into sitemap rows", () => {
    const entries = buildSitemapEntries([
      {
        type: "news",
        path: "/news/market",
        publishedAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      },
    ]);

    expect(entries.some((entry) => entry.url === absoluteSiteUrl("/"))).toBe(true);
    expect(entries).toContainEqual({
      url: absoluteSiteUrl("/news/market"),
      lastModified: new Date("2026-06-02T00:00:00.000Z"),
      changeFrequency: "daily",
      priority: 0.75,
    });
  });
});
