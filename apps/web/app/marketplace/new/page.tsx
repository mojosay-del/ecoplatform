import { Suspense } from "react";
import { ListingFormView } from "../../../src/views/marketplace";

export default function NewListingPage() {
  return (
    <Suspense fallback={null}>
      <ListingFormView />
    </Suspense>
  );
}
