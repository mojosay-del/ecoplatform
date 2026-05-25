import { LearningModuleView } from "../../../src/views/learning-view";

export default async function LearningModulePage({ params }: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await params;
  return <LearningModuleView moduleId={moduleId} />;
}
