import { KnowledgeArticleView } from "../../../src/views/knowledge-base-view";

export default async function KnowledgeArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <KnowledgeArticleView slug={slug} />;
}
