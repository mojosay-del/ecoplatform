import { Suspense } from "react";
import { ListingDetailView } from "../../../src/views/marketplace";

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <ListingDetailView id={id} />
    </Suspense>
  );
}
