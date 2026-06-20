import { Suspense } from "react";
import { createPageMetadata } from "../../src/lib/seo";
import { MarketplaceView } from "../../src/views/marketplace";

export const metadata = createPageMetadata({
  title: "Торговая площадка",
  description: "Закрытый аукцион заявок на вторсырьё на ЭкоПлатформе.",
  path: "/marketplace",
  noIndex: true,
});

export default function MarketplacePage() {
  return (
    <Suspense fallback={null}>
      <MarketplaceView />
    </Suspense>
  );
}
