import { createPageMetadata } from "../../src/lib/seo";
import { ForumListView } from "../../src/views/forum";

export const metadata = createPageMetadata({
  title: "Форум",
  description: "Вопросы и ответы сообщества ЭкоПлатформы по вторсырью, логистике, документам и оборудованию.",
  path: "/forum",
});

export default function ForumPage() {
  return <ForumListView />;
}
