import { AdminJsonEditor } from "../../../../src/components/AdminJsonEditor";

const sample = {
  parentId: null,
  title: "Гофрокартон",
  subtitle: "Гофрированный картон, коробки, ящики",
  position: 0,
  iconType: "paper",
  blocks: [
    { type: "heading", payload: { text: "ГОСТы" } },
    { type: "paragraph", payload: { markdown: "Здесь фиксируются ГОСТы и требования заводов." } },
    { type: "checklist", payload: { title: "Принимается", style: "positive", items: ["Сухой чистый картон", "Без плёнки"] } },
    { type: "checklist", payload: { title: "Риски", style: "warning", items: ["Повышенная влажность", "Засор"] } },
  ],
};

export default function AdminKnowledgePage() {
  return (
    <AdminJsonEditor
      title="CMS / База знаний"
      endpoint="/admin/content/knowledge-base"
      listEndpoint="/admin/content/knowledge-base"
      publishEndpointTemplate="/admin/content/knowledge-base/:id/publish"
      sample={sample}
    />
  );
}
