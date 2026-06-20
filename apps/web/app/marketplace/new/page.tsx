import { Suspense } from "react";
import { createPageMetadata } from "../../../src/lib/seo";
import { ListingFormView } from "../../../src/views/marketplace";

export const metadata = createPageMetadata({
  title: "Новое объявление",
  description: "Разместить заявку на вторсырьё на торговой площадке.",
  path: "/marketplace/new",
  noIndex: true,
});

export default function NewListingPage() {
  return (
    <Suspense fallback={null}>
      <ListingFormView />
    </Suspense>
  );
}
