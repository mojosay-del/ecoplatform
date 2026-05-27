import { NewsPostView } from "../../../src/views/news-view";

export default async function NewsPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { slug } = await params;
  const { preview } = await searchParams;
  return <NewsPostView slug={slug} preview={preview === "1" || preview === "true"} />;
}
