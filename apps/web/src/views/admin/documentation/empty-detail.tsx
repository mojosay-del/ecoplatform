export function DocEmptyDetail({ categoriesCount }: { categoriesCount: number }) {
  return (
    <div className="indices-empty-detail">
      <h2>Выберите раздел или документ слева</h2>
      <p>
        {categoriesCount > 0
          ? "Документы добавляются внутри раздела."
          : "Сначала создайте раздел через плюс в левом дереве."}
      </p>
    </div>
  );
}
