import { AdminJsonEditor } from "../../../../src/components/AdminJsonEditor";

const sample = {
  title: "Новая новость рынка",
  lead: "Короткое описание для карточки новости.",
  tags: ["рынок"],
  blocks: [
    {
      type: "paragraph",
      payload: {
        markdown: "Текст новости. Можно использовать markdown для списков и ссылок.",
      },
    },
  ],
};

export default function AdminNewsPage() {
  return <AdminJsonEditor title="CMS / Новости" endpoint="/admin/content/news" sample={sample} />;
}
