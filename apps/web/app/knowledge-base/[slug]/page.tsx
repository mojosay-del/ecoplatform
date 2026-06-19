import type { Metadata } from "next";
import { createDynamicSeoMetadata } from "../../../src/lib/seo";
import { KnowledgeArticleView } from "../../../src/views/knowledge-base-view";

type KnowledgeArticlePageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: KnowledgeArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  return createDynamicSeoMetadata(`/knowledge-base/${slug}`, {
    title: "Материал базы знаний",
    description: "Материал базы знаний ЭкоПлатформы для рынка вторсырья.",
  });
}

export default async function KnowledgeArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <KnowledgeArticleView slug={slug} />;
}
