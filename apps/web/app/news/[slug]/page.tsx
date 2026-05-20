import { NewsPostView } from "../../../src/components/DataViews";

export default async function NewsPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <NewsPostView slug={slug} />;
}
