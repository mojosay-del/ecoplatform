import { LessonView } from "../../../../src/views/learning";

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ moduleId: string; lessonId: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { moduleId, lessonId } = await params;
  const { preview } = await searchParams;
  return <LessonView moduleId={moduleId} lessonId={lessonId} preview={preview === "1" || preview === "true"} />;
}
