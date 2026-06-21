import type { Metadata } from "next";
import { createDynamicSeoMetadata, staticParamsForType } from "../../../src/lib/seo";
import { KnowledgeArticleView } from "../../../src/views/knowledge-base-view";

type KnowledgeArticlePageProps = { params: Promise<{ slug: string }> };

// ISR (A-3): опубликованные материалы кэшируются как статический HTML и
// перевалидируются раз в 5 минут; новые/неизвестные slug рендерятся on-demand
// (dynamicParams по умолчанию true) и тоже попадают в кэш.
export const revalidate = 300;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return (await staticParamsForType("knowledge_base")).map((slug) => ({ slug }));
}

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
