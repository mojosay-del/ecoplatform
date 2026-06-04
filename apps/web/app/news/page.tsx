import { Suspense } from "react";
import { NewsView } from "../../src/views/news";

export default function NewsPage() {
  return (
    <Suspense fallback={null}>
      <NewsView />
    </Suspense>
  );
}
