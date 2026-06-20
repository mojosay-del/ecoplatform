import { Suspense } from "react";
import { createPageMetadata } from "../../../src/lib/seo";
import { MyOffersView } from "../../../src/views/marketplace";

export const metadata = createPageMetadata({
  title: "Мои предложения",
  description: "Ваши ставки в закрытых аукционах площадки.",
  path: "/marketplace/offers",
  noIndex: true,
});

export default function MyOffersPage() {
  return (
    <Suspense fallback={null}>
      <MyOffersView />
    </Suspense>
  );
}
