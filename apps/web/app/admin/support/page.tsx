import { AppShell } from "../../../src/components/AppShell";

export default function AdminSupportPage() {
  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">Админ / Поддержка</h1>
          <p className="page-subtitle">Очередь обращений доступна через API `/admin/support/tickets`.</p>
        </header>
        <article className="card">
          <h2>Первый экран поддержки</h2>
          <p>На этом этапе API уже умеет создавать обращения и ответы. Следующий шаг интерфейса — таблица тикетов и экран переписки.</p>
        </article>
      </section>
    </AppShell>
  );
}
