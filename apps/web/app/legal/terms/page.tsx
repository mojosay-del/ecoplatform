import { LegalDocumentPage } from "../../../src/components/LegalDocumentPage";

export const metadata = { title: "Пользовательское соглашение · ЭкоПлатформа" };

export default function TermsPage() {
  return <LegalDocumentPage type="terms_of_service" />;
}
