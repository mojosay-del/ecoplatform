import { Suspense } from "react";
import { MyOffersView } from "../../../src/views/marketplace";

export default function MyOffersPage() {
  return (
    <Suspense fallback={null}>
      <MyOffersView />
    </Suspense>
  );
}
