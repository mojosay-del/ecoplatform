import type { Metadata, MetadataRoute } from "next";
import type { SeoPageSummary, SeoPageType, SeoSitemapEntry, SeoSitemapResponse } from "@ecoplatform/shared";
import { API_URL } from "./api/config";

export const SITE_NAME = "ЭкоПлатформа";
export const DEFAULT_SITE_URL = "https://ecoplatform.pro";
export const DEFAULT_OG_IMAGE_PATH = "/brand/logo.webp";

const SEO_REVALIDATE_SECONDS = 300;
const MAX_SNIPPET = -1;
const MAX_VIDEO_PREVIEW = -1;

type ChangeFrequency = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;

export type StaticSitemapRoute = {
  path: string;
  changeFrequency: ChangeFrequency;
  priority: number;
};

export const STATIC_SITEMAP_ROUTES: StaticSitemapRoute[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/news", changeFrequency: "daily", priority: 0.9 },
  { path: "/knowledge-base", changeFrequency: "weekly", priority: 0.85 },
  { path: "/documentation", changeFrequency: "weekly", priority: 0.8 },
  { path: "/forum", changeFrequency: "daily", priority: 0.75 },
  { path: "/indices", changeFrequency: "weekly", priority: 0.75 },
  { path: "/education", changeFrequency: "monthly", priority: 0.65 },
  { path: "/calculators/retail", changeFrequency: "monthly", priority: 0.6 },
  { path: "/legal/privacy", changeFrequency: "yearly", priority: 0.35 },
  { path: "/legal/terms", changeFrequency: "yearly", priority: 0.35 },
  { path: "/legal/personal-data", changeFrequency: "yearly", priority: 0.35 },
  { path: "/legal/cookies", changeFrequency: "yearly", priority: 0.3 },
  { path: "/legal/offer", changeFrequency: "yearly", priority: 0.3 },
];

type PageMetadataInput = {
  title: string;
  description: string;
  path: string;
  imageUrl?: string | null;
  noIndex?: boolean;
  openGraphType?: "website" | "article";
};

export function normalizeSiteUrl(value?: string | null): string {
  const raw = value?.trim() || process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || process.env.WEB_ORIGIN;
  if (!raw) {
    return DEFAULT_SITE_URL;
  }

  try {
    const url = new URL(raw);
    return url.origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export function getSiteUrl(): string {
  return normalizeSiteUrl();
}

export function cleanPath(path: string): string {
  if (!path || path === "/") {
    return "/";
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized.replace(/\/+$/, "") || "/";
}

export function absoluteSiteUrl(path: string): string {
  const normalizedPath = cleanPath(path);
  return normalizedPath === "/" ? getSiteUrl() : `${getSiteUrl()}${normalizedPath}`;
}

export function titleWithSiteName(title: string): string {
  return title === SITE_NAME || title.endsWith(`· ${SITE_NAME}`) ? title : `${title} · ${SITE_NAME}`;
}

export function createPageMetadata(input: PageMetadataInput): Metadata {
  const title = titleWithSiteName(input.title);
  const canonicalPath = cleanPath(input.path);
  const canonicalUrl = absoluteSiteUrl(canonicalPath);
  const imageUrl = input.imageUrl ?? absoluteSiteUrl(DEFAULT_OG_IMAGE_PATH);
  const robots = input.noIndex
    ? {
        index: false,
        follow: false,
        googleBot: {
          index: false,
          follow: false,
        },
      }
    : {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          "max-snippet": MAX_SNIPPET,
          "max-image-preview": "large" as const,
          "max-video-preview": MAX_VIDEO_PREVIEW,
        },
      };

  return {
    title,
    description: input.description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title,
      description: input.description,
      url: canonicalUrl,
      siteName: SITE_NAME,
      locale: "ru_RU",
      type: input.openGraphType ?? "website",
      images: [{ url: imageUrl, alt: SITE_NAME }],
    } as Metadata["openGraph"],
    twitter: {
      card: "summary_large_image",
      title,
      description: input.description,
      images: [imageUrl],
    },
    robots,
  };
}

export async function createDynamicSeoMetadata(
  path: string,
  fallback: Pick<PageMetadataInput, "title" | "description">,
): Promise<Metadata> {
  const summary = await fetchSeoPage(path);
  if (!summary) {
    return createPageMetadata({
      ...fallback,
      path,
      noIndex: true,
    });
  }

  return createPageMetadata({
    title: summary.title,
    description: summary.description,
    path: summary.path,
    imageUrl: summary.imageUrl,
    openGraphType: summary.type === "news" || summary.type === "forum_question" ? "article" : "website",
  });
}

export async function fetchSeoPage(path: string): Promise<SeoPageSummary | null> {
  const url = `${API_URL}/seo/pages?path=${encodeURIComponent(cleanPath(path))}`;
  try {
    const response = await fetch(url, seoFetchInit());
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as SeoPageSummary;
  } catch {
    return null;
  }
}

export async function fetchSeoSitemap(): Promise<SeoSitemapResponse | null> {
  try {
    const response = await fetch(`${API_URL}/seo/sitemap`, seoFetchInit());
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as SeoSitemapResponse;
  } catch {
    return null;
  }
}

// Параметры для `generateStaticParams` detail-страниц (ISR): берём из того же
// SEO-sitemap, что и карта сайта, и достаём последний сегмент пути как slug/id.
// Best-effort: на этапе сборки API может быть недоступен → fetchSeoSitemap
// вернёт null, helper отдаст []. Тогда страницы рендерятся on-demand при первом
// заходе и кэшируются по `revalidate` (ISR работает и без build-time префетча).
export async function staticParamsForType(type: SeoPageType): Promise<string[]> {
  const sitemap = await fetchSeoSitemap();
  if (!sitemap) {
    return [];
  }
  return sitemap.items
    .filter((entry) => entry.type === type)
    .map((entry) => cleanPath(entry.path).split("/").filter(Boolean).pop())
    .filter((slug): slug is string => Boolean(slug));
}

export function buildSitemapEntries(dynamicEntries: SeoSitemapEntry[] = []): MetadataRoute.Sitemap {
  const staticEntries = STATIC_SITEMAP_ROUTES.map((route) => ({
    url: absoluteSiteUrl(route.path),
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const dynamic = dynamicEntries.map((entry) => ({
    url: absoluteSiteUrl(entry.path),
    lastModified: new Date(entry.updatedAt),
    changeFrequency: changeFrequencyForDynamicEntry(entry),
    priority: priorityForDynamicEntry(entry),
  }));

  return [...staticEntries, ...dynamic];
}

function seoFetchInit(): RequestInit & { next: { revalidate: number } } {
  return {
    next: { revalidate: SEO_REVALIDATE_SECONDS },
  };
}

function changeFrequencyForDynamicEntry(entry: SeoSitemapEntry): ChangeFrequency {
  if (entry.type === "news" || entry.type === "forum_question") {
    return "daily";
  }
  if (entry.type === "documentation") {
    return "weekly";
  }
  return "monthly";
}

function priorityForDynamicEntry(entry: SeoSitemapEntry): number {
  if (entry.type === "news") {
    return 0.75;
  }
  if (entry.type === "knowledge_base" || entry.type === "documentation") {
    return 0.7;
  }
  return 0.6;
}
