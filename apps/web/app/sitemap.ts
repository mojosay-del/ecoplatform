import type { MetadataRoute } from "next";
import { buildSitemapEntries, fetchSeoSitemap } from "../src/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const dynamic = await fetchSeoSitemap();
  return buildSitemapEntries(dynamic?.items ?? []);
}
