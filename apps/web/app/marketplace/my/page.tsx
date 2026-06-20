import { Suspense } from "react";
import { createPageMetadata } from "../../../src/lib/seo";
import { MyListingsView } from "../../../src/views/marketplace";

export const metadata = createPageMetadata({
  title: "Мои объявления",
  description: "Ваши заявки на торговой площадке ЭкоПлатформы.",
  path: "/marketplace/my",
  noIndex: true,
});

export default function MyListingsPage() {
  return (
    <Suspense fallback={null}>
      <MyListingsView />
    </Suspense>
  );
}
