import { LegalDocumentPage } from "../../../src/components/LegalDocumentPage";
import { createPageMetadata } from "../../../src/lib/seo";

export const metadata = createPageMetadata({
  title: "Политика конфиденциальности",
  description: "Политика конфиденциальности ЭкоПлатформы.",
  path: "/legal/privacy",
});

export default function PrivacyPolicyPage() {
  return <LegalDocumentPage type="privacy_policy" />;
}
