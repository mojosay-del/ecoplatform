import { Suspense } from "react";
import { createPageMetadata } from "../../src/lib/seo";
import { NewsView } from "../../src/views/news";

export const metadata = createPageMetadata({
  title: "Новости рынка",
  description: "События, законы, сделки и сигналы рынка вторсырья на ЭкоПлатформе.",
  path: "/news",
});

export default function NewsPage() {
  return (
    <Suspense fallback={null}>
      <NewsView />
    </Suspense>
  );
}
