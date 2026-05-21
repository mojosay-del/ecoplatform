import { KnowledgeArticleView } from "../../../src/components/DataViews";

export default async function KnowledgeArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <KnowledgeArticleView slug={slug} />;
}
