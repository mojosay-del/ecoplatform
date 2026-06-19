import { MarketingShell } from "../../src/components/MarketingShell";
import { SUPPORT_EMAIL } from "../../src/lib/platform-contact";
import { createPageMetadata } from "../../src/lib/seo";
import { ForgotPasswordCard } from "./ForgotPasswordCard";

export const metadata = createPageMetadata({
  title: "Восстановление доступа",
  description: "Информация по восстановлению доступа к аккаунту ЭкоПлатформы.",
  path: "/forgot-password",
  noIndex: true,
});

// Восстановление пароля по email пока не реализовано: нет email-провайдера и
// токенов сброса. Чтобы не уводить пользователя в 404, страница объясняет,
// что делать сейчас, и даёт контакт поддержки.
export default function ForgotPasswordPage() {
  return (
    <MarketingShell>
      <ForgotPasswordCard supportEmail={SUPPORT_EMAIL} />
    </MarketingShell>
  );
}
