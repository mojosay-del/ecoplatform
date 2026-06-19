import { LegalDocumentPage } from "../../../src/components/LegalDocumentPage";
import { createPageMetadata } from "../../../src/lib/seo";

export const metadata = createPageMetadata({
  title: "Согласие на обработку персональных данных",
  description: "Согласие на обработку персональных данных пользователей ЭкоПлатформы.",
  path: "/legal/personal-data",
});

export default function PersonalDataPage() {
  return <LegalDocumentPage type="personal_data_consent" />;
}
