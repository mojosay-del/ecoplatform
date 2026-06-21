import { afterEach, describe, expect, it, vi } from "vitest";
import {
  absoluteSiteUrl,
  buildSitemapEntries,
  createPageMetadata,
  normalizeSiteUrl,
  staticParamsForType,
  titleWithSiteName,
} from "./seo";

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

describe("staticParamsForType (ISR generateStaticParams)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("отбирает slug нужного типа и достаёт последний сегмент пути", async () => {
    const sitemap = JSON.stringify({
      items: [
        { type: "news", path: "/news/market", publishedAt: null, updatedAt: "2026-06-02T00:00:00.000Z" },
        { type: "news", path: "/news/prices/", publishedAt: null, updatedAt: "2026-06-02T00:00:00.000Z" },
        {
          type: "documentation",
          path: "/documentation/gost",
          publishedAt: null,
          updatedAt: "2026-06-02T00:00:00.000Z",
        },
        { type: "forum_question", path: "/forum/q/abc123", publishedAt: null, updatedAt: "2026-06-02T00:00:00.000Z" },
      ],
    });
    // Тело Response одноразовое — отдаём свежий объект на каждый вызов fetch.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(new Response(sitemap, { status: 200 }))),
    );

    await expect(staticParamsForType("news")).resolves.toEqual(["market", "prices"]);
    await expect(staticParamsForType("forum_question")).resolves.toEqual(["abc123"]);
  });

  it("возвращает [] при недоступном API (build-time без бэкенда → on-demand ISR)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    await expect(staticParamsForType("news")).resolves.toEqual([]);
  });
});
