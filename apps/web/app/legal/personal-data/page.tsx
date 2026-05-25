import { LegalDocumentPage } from "../../../src/components/LegalDocumentPage";

export const metadata = { title: "Согласие на обработку персональных данных · ЭкоПлатформа" };

export default function PersonalDataPage() {
  return <LegalDocumentPage type="personal_data_consent" />;
}
