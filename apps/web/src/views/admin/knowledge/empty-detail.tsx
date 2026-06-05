export function KnowledgeEmptyDetail({ categoriesCount }: { categoriesCount: number }) {
  return (
    <div className="indices-empty-detail">
      <h2>Выберите категорию или материал слева</h2>
      <p>
        {categoriesCount > 0
          ? "Материалы добавляются через меню категории."
          : "Сначала создайте категорию через плюс в левом дереве."}
      </p>
    </div>
  );
}
