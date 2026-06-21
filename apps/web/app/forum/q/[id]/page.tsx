import type { Metadata } from "next";
import { Suspense } from "react";
import { createDynamicSeoMetadata, staticParamsForType } from "../../../../src/lib/seo";
import { ForumQuestionView } from "../../../../src/views/forum";

type ForumQuestionPageProps = { params: Promise<{ id: string }> };

// ISR (A-3): опубликованные вопросы кэшируются как статический HTML и
// перевалидируются раз в 5 минут; новые/неизвестные id рендерятся on-demand
// (dynamicParams по умолчанию true) и тоже попадают в кэш.
export const revalidate = 300;

export async function generateStaticParams(): Promise<{ id: string }[]> {
  return (await staticParamsForType("forum_question")).map((id) => ({ id }));
}

export async function generateMetadata({ params }: ForumQuestionPageProps): Promise<Metadata> {
  const { id } = await params;
  return createDynamicSeoMetadata(`/forum/q/${id}`, {
    title: "Вопрос форума",
    description: "Вопрос и ответы сообщества ЭкоПлатформы.",
  });
}

export default async function ForumQuestionPage({ params }: ForumQuestionPageProps) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <ForumQuestionView id={id} />
    </Suspense>
  );
}
