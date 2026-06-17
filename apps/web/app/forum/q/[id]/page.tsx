import { Suspense } from "react";
import { ForumQuestionView } from "../../../../src/views/forum";

export default async function ForumQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <ForumQuestionView id={id} />
    </Suspense>
  );
}
