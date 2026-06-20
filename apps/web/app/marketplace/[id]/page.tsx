import { Suspense } from "react";
import { createPageMetadata } from "../../../src/lib/seo";
import { ListingDetailView } from "../../../src/views/marketplace";

export const metadata = createPageMetadata({
  title: "Объявление",
  description: "Заявка на вторсырьё на торговой площадке ЭкоПлатформы.",
  path: "/marketplace",
  noIndex: true,
});

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <ListingDetailView id={id} />
    </Suspense>
  );
}
