import type { Metadata } from "next";
import { createDynamicSeoMetadata, staticParamsForType } from "../../../src/lib/seo";
import { DocumentationArticleView } from "../../../src/views/documentation";

type DocumentationArticlePageProps = { params: Promise<{ slug: string }> };

// ISR (A-3): опубликованные документы кэшируются как статический HTML и
// перевалидируются раз в 5 минут; новые/неизвестные slug рендерятся on-demand
// (dynamicParams по умолчанию true) и тоже попадают в кэш.
export const revalidate = 300;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return (await staticParamsForType("documentation")).map((slug) => ({ slug }));
}

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
