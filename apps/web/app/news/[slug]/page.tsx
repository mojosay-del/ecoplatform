import type { Metadata } from "next";
import { NewsPostView } from "../../../src/views/news";
import { createDynamicSeoMetadata, createPageMetadata } from "../../../src/lib/seo";

type NewsPostPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
};

export async function generateMetadata({ params, searchParams }: NewsPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { preview } = await searchParams;
  if (preview === "1" || preview === "true") {
    return createPageMetadata({
      title: "Предпросмотр новости",
      description: "Предпросмотр новости доступен только авторизованным сотрудникам платформы.",
      path: `/news/${slug}`,
      noIndex: true,
    });
  }

  return createDynamicSeoMetadata(`/news/${slug}`, {
    title: "Новость",
    description: "Новость рынка вторсырья на ЭкоПлатформе.",
  });
}

export default async function NewsPostPage({ params, searchParams }: NewsPostPageProps) {
  const { slug } = await params;
  const { preview } = await searchParams;
  return <NewsPostView slug={slug} preview={preview === "1" || preview === "true"} />;
}
