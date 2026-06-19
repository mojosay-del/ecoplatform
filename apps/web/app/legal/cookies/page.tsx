import { LegalDocumentPage } from "../../../src/components/LegalDocumentPage";
import { createPageMetadata } from "../../../src/lib/seo";

export const metadata = createPageMetadata({
  title: "Политика использования cookies",
  description: "Политика использования cookies на ЭкоПлатформе.",
  path: "/legal/cookies",
});

export default function CookiesPage() {
  return <LegalDocumentPage type="cookie_policy" />;
}
