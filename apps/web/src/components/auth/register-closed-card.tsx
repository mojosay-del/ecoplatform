import Link from "next/link";
import { Lock } from "lucide-react";

export function RegisterClosedCard() {
  return (
    <div className="ui-card ui-card-wide auth-closed">
      <span className="auth-closed-badge" aria-hidden="true">
        <Lock size={28} strokeWidth={1.75} />
      </span>
      <span className="auth-closed-pill">
        <span className="auth-closed-pill-dot" aria-hidden="true" />
        Скоро откроется
      </span>
      <header className="ui-card-head">
        <h1 className="ui-card-title">Регистрация закрыта</h1>
        <p className="ui-card-sub">
          Регистрация новых пользователей временно отключена. Загляните чуть позже — мы готовим место для новых
          компаний.
        </p>
      </header>
      <Link className="button form-submit auth-closed-cta" href="/login">
        Войти в аккаунт
      </Link>
      <p className="ui-card-sub auth-closed-foot">Уже есть аккаунт? Войдите по кнопке выше.</p>
    </div>
  );
}
