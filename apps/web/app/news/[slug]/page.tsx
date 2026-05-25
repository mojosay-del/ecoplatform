import { NewsPostView } from "../../../src/views/news-view";

export default async function NewsPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <NewsPostView slug={slug} />;
}
