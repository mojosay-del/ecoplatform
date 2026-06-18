import { MarketingShell } from "../../src/components/MarketingShell";
import { SUPPORT_EMAIL } from "../../src/lib/platform-contact";
import { ForgotPasswordCard } from "./ForgotPasswordCard";

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
