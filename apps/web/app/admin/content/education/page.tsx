import { AdminJsonEditor } from "../../../../src/components/AdminJsonEditor";

const sample = {
  title: "Закупка сырья",
  summary: "Короткое описание модуля.",
  description: "Полное описание модуля.",
  accessLevel: "basic",
  preview: {
    promotionalDescription: "Описание для пользователя без доступа.",
    whatYouWillLearn: ["Проверять качество партии", "Снижать риски закупки"],
  },
  chapters: [
    {
      title: "Основы",
      lessons: [
        {
          title: "Первый урок",
          blocks: [
            {
              type: "paragraph",
              payload: { markdown: "Текст урока." },
            },
          ],
          attachments: [],
        },
      ],
    },
  ],
};

export default function AdminEducationPage() {
  return (
    <AdminJsonEditor
      title="CMS / Обучение"
      endpoint="/admin/content/education/modules"
      listEndpoint="/admin/content/education"
      publishEndpointTemplate="/admin/content/education/modules/:id/publish"
      sample={sample}
    />
  );
}
