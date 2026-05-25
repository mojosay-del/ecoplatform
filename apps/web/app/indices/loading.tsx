import { PageSkeleton } from "../../src/components/PageSkeleton";

export default function IndicesLoading() {
  return (
    <PageSkeleton
      title="Индексы цен на вторсырьё"
      subtitle="Актуальные ценовые индексы по основным категориям сырья."
      variant="grid"
    />
  );
}
