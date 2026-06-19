import type { Metadata } from "next";
import { Suspense } from "react";
import { createDynamicSeoMetadata } from "../../../../src/lib/seo";
import { ForumQuestionView } from "../../../../src/views/forum";

type ForumQuestionPageProps = { params: Promise<{ id: string }> };

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
