import type { ReactNode } from "react";
import { MarketplaceRouteGate } from "../../src/views/marketplace";

export default function MarketplaceLayout({ children }: { children: ReactNode }) {
  return <MarketplaceRouteGate>{children}</MarketplaceRouteGate>;
}
