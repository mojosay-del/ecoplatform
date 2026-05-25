import { LessonView } from "../../../../src/views/learning-view";

export default async function LessonPage({ params }: { params: Promise<{ moduleId: string; lessonId: string }> }) {
  const { moduleId, lessonId } = await params;
  return <LessonView moduleId={moduleId} lessonId={lessonId} />;
}
