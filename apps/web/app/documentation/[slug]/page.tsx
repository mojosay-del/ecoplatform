import type { Metadata } from "next";
import { createDynamicSeoMetadata } from "../../../src/lib/seo";
import { DocumentationArticleView } from "../../../src/views/documentation";

type DocumentationArticlePageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: DocumentationArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  return createDynamicSeoMetadata(`/documentation/${slug}`, {
    title: "Документ",
    description: "Документ ЭкоПлатформы для работы с вторсырьём.",
  });
}

export default async function DocumentationArticlePage({ params }: DocumentationArticlePageProps) {
  const { slug } = await params;
  return <DocumentationArticleView slug={slug} />;
}
