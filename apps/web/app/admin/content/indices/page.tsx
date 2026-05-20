import { AdminJsonEditor } from "../../../../src/components/AdminJsonEditor";

const sample = {
  nomenclatureId: "ID номенклатуры из справочника",
  description: "Служебное описание индекса",
};

export default function AdminIndicesPage() {
  return <AdminJsonEditor title="CMS / Индексы цен" endpoint="/admin/content/indices" sample={sample} />;
}
