import { RegisterForm } from "../../src/components/AuthForms";
import { createPageMetadata } from "../../src/lib/seo";

export const metadata = createPageMetadata({
  title: "Регистрация",
  description: "Создание demo-доступа к ЭкоПлатформе.",
  path: "/register",
  noIndex: true,
});

export default function RegisterPage() {
  return <RegisterForm />;
}
