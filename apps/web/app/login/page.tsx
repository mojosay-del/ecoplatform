import { LoginForm } from "../../src/components/AuthForms";
import { createPageMetadata } from "../../src/lib/seo";

export const metadata = createPageMetadata({
  title: "Вход",
  description: "Вход в личный кабинет ЭкоПлатформы.",
  path: "/login",
  noIndex: true,
});

export default function LoginPage() {
  return <LoginForm />;
}
