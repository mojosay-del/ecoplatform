import { Suspense } from "react";
import { NewsView } from "../../src/views/news-view";

export default function NewsPage() {
  return (
    <Suspense fallback={null}>
      <NewsView />
    </Suspense>
  );
}
