import Link from "next/link";

export default function NotFound() {
  return (
    <main className="auth-page">
      <div className="auth-layout">
        <div className="auth-form-panel">
          <div className="auth-card" style={{ textAlign: "center" }}>
            <h1 className="auth-card-title" style={{ fontSize: "44px" }}>
              404
            </h1>
            <p className="auth-card-sub">Страница не найдена.</p>
            <p className="page-subtitle">
              Возможно, ссылка устарела или адрес введён с опечаткой. Из этой точки удобнее вернуться к ленте новостей
              или войти в кабинет.
            </p>
            <div className="auth-actions" style={{ marginTop: "24px" }}>
              <Link className="button" href="/news">
                К новостям
              </Link>
              <Link className="button secondary" href="/login">
                Войти
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
