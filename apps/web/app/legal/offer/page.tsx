import { LegalDocumentPage } from "../../../src/components/LegalDocumentPage";
import { createPageMetadata } from "../../../src/lib/seo";

export const metadata = createPageMetadata({
  title: "Публичная оферта",
  description: "Публичная оферта ЭкоПлатформы.",
  path: "/legal/offer",
});

export default function OfferPage() {
  return <LegalDocumentPage type="offer_agreement" />;
}
