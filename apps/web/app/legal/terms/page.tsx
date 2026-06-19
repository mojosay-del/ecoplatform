import { LegalDocumentPage } from "../../../src/components/LegalDocumentPage";
import { createPageMetadata } from "../../../src/lib/seo";

export const metadata = createPageMetadata({
  title: "Пользовательское соглашение",
  description: "Пользовательское соглашение ЭкоПлатформы.",
  path: "/legal/terms",
});

export default function TermsPage() {
  return <LegalDocumentPage type="terms_of_service" />;
}
