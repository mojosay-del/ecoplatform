import { createPageMetadata } from "../../src/lib/seo";
import { KnowledgeBaseView } from "../../src/views/knowledge-base-view";

export const metadata = createPageMetadata({
  title: "База знаний",
  description: "Практические материалы по видам вторсырья, качеству, сортировке и отраслевым требованиям.",
  path: "/knowledge-base",
});

export default function KnowledgeBasePage() {
  return <KnowledgeBaseView />;
}
