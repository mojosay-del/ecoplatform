import { createPageMetadata } from "../../src/lib/seo";
import { DocumentationView } from "../../src/views/documentation";

export const metadata = createPageMetadata({
  title: "Документация",
  description: "Регламенты, шаблоны и справочные документы для участников рынка вторсырья.",
  path: "/documentation",
});

export default function DocumentationPage() {
  return <DocumentationView />;
}
