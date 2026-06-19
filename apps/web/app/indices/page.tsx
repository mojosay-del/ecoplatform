import { createPageMetadata } from "../../src/lib/seo";
import { IndicesView } from "../../src/views/indices";

export const metadata = createPageMetadata({
  title: "Индексы цен на вторсырьё",
  description: "Динамика цен и ориентиры по ключевым видам вторсырья на ЭкоПлатформе.",
  path: "/indices",
});

export default function IndicesPage() {
  return <IndicesView />;
}
