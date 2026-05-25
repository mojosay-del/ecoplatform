import Link from "next/link";

// Восстановление пароля по email пока не реализовано: нет email-провайдера и
// токенов сброса. Чтобы не уводить пользователя в 404, страница объясняет,
// что делать сейчас, и даёт контакт поддержки.
export default function ForgotPasswordPage() {
  return (
    <main className="auth-page">
      <div className="auth-layout">
        <div className="auth-form-panel">
          <div className="auth-card">
            <header className="auth-card-head">
              <h1 className="auth-card-title">Восстановление пароля</h1>
              <p className="auth-card-sub">
                Пока на стадии MVP — самостоятельный сброс пароля будет доступен в ближайшем обновлении.
              </p>
            </header>
            <p className="page-subtitle">
              Если вы не можете войти, напишите администратору платформы — мы вручную поможем восстановить доступ.
            </p>
            <p className="page-subtitle">
              Электронная почта поддержки: <a href="mailto:support@ecoplatform.local">support@ecoplatform.local</a>
            </p>
            <div className="auth-actions" style={{ marginTop: "24px" }}>
              <Link className="button" href="/login">
                Вернуться к входу
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
