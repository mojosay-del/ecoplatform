import { LandingView } from "../src/views/landing";
import { createPageMetadata, SITE_NAME } from "../src/lib/seo";

export const metadata = createPageMetadata({
  title: SITE_NAME,
  description:
    "ЭкоПлатформа помогает участникам рынка вторсырья работать с новостями, индексами, знаниями и документами.",
  path: "/",
});

// Заглавная (презентационная) страница — первое, что видит гость.
// Залогиненного пользователя LandingView сам уводит в кабинет (/news).
export default function HomePage() {
  return <LandingView />;
}
