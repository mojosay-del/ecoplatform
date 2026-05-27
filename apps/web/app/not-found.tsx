import Link from "next/link";
import { MarketingShell } from "../src/components/MarketingShell";

export default function NotFound() {
  return (
    <MarketingShell>
      <div className="auth-card marketing-card marketing-card-centered">
        <h1 className="auth-card-title">404</h1>
        <p className="auth-card-sub">Страница не найдена.</p>
        <p className="page-subtitle">
          Возможно, ссылка устарела или адрес введён с опечаткой. Из этой точки удобнее вернуться к ленте новостей или
          войти в кабинет.
        </p>
        <div className="auth-actions marketing-actions">
          <Link className="button" href="/news">
            К новостям
          </Link>
          <Link className="button secondary" href="/login">
            Войти
          </Link>
        </div>
      </div>
    </MarketingShell>
  );
}
