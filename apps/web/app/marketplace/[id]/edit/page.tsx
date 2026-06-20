import { Suspense } from "react";
import { createPageMetadata } from "../../../../src/lib/seo";
import { ListingFormView } from "../../../../src/views/marketplace";

export const metadata = createPageMetadata({
  title: "Редактирование объявления",
  description: "Изменить заявку на торговой площадке ЭкоПлатформы.",
  path: "/marketplace",
  noIndex: true,
});

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <ListingFormView listingId={id} />
    </Suspense>
  );
}
