import { LearningModuleView } from "../../../src/views/learning-view";

export default async function LearningModulePage({
  params,
  searchParams,
}: {
  params: Promise<{ moduleId: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { moduleId } = await params;
  const { preview } = await searchParams;
  return <LearningModuleView moduleId={moduleId} preview={preview === "1" || preview === "true"} />;
}
