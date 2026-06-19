import { createPageMetadata } from "../../src/lib/seo";
import { EducationView } from "../../src/views/learning";

export const metadata = createPageMetadata({
  title: "Обучение",
  description: "Практические модули обучения для компаний рынка вторсырья.",
  path: "/education",
});

export default function EducationPage() {
  return <EducationView />;
}
