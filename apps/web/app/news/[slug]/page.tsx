import type { Metadata } from "next";
import { Suspense } from "react";
import { NewsPostView } from "../../../src/views/news";
import { createDynamicSeoMetadata, staticParamsForType } from "../../../src/lib/seo";

type NewsPostPageProps = { params: Promise<{ slug: string }> };

// ISR (A-3): опубликованные новости кэшируются как статический HTML и
// перевалидируются раз в 5 минут; новые/неизвестные slug рендерятся on-demand
// (dynamicParams по умолчанию true) и тоже попадают в кэш. Режим предпросмотра
// (?preview=1) больше не читается на сервере — иначе доступ к searchParams
// переводил бы маршрут в полностью динамический рендеринг и ломал ISR. Флаг
// предпросмотра определяет клиент (NewsPostView через useSearchParams); для
// неопубликованных черновиков SEO-эндпоинт всё равно отдаёт noIndex-fallback.
export const revalidate = 300;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return (await staticParamsForType("news")).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: NewsPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  return createDynamicSeoMetadata(`/news/${slug}`, {
    title: "Новость",
    description: "Новость рынка вторсырья на ЭкоПлатформе.",
  });
}

export default async function NewsPostPage({ params }: NewsPostPageProps) {
  const { slug } = await params;
  return (
    <Suspense fallback={null}>
      <NewsPostView slug={slug} />
    </Suspense>
  );
}
