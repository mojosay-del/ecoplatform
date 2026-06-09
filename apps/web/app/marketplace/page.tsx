import { Suspense } from "react";
import { MarketplaceView } from "../../src/views/marketplace";

export default function MarketplacePage() {
  return (
    <Suspense fallback={null}>
      <MarketplaceView />
    </Suspense>
  );
}
