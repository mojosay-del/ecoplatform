import { Suspense } from "react";
import { ListingFormView } from "../../../../src/views/marketplace";

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <ListingFormView listingId={id} />
    </Suspense>
  );
}
