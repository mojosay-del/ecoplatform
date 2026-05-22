import { Suspense } from "react";
import { NewsView } from "../../src/components/DataViews";

export default function NewsPage() {
  return (
    <Suspense fallback={null}>
      <NewsView />
    </Suspense>
  );
}
