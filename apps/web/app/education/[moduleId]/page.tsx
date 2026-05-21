import { LearningModuleView } from "../../../src/components/DataViews";

export default async function LearningModulePage({
  params,
}: {
  params: Promise<{ moduleId: string }>;
}) {
  const { moduleId } = await params;
  return <LearningModuleView moduleId={moduleId} />;
}
