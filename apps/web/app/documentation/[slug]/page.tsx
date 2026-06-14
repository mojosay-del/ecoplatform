import { DocumentationArticleView } from "../../../src/views/documentation";

export default async function DocumentationArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <DocumentationArticleView slug={slug} />;
}
