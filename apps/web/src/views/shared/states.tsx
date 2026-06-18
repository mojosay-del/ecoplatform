"use client";

// Базовые экраны состояний — одинаковые на всех страницах, поэтому удобно
// держать в одном месте. Каждый кладёт себя внутрь AppShell, чтобы пользователь
// видел сайдбар, а не «голый» экран.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { canAccessEducationSection } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { accountProfileModalHref } from "../../components/app-shell-nav";
import { StatusPill } from "../../components/StatusPill";
import { useAuth } from "../../lib/auth";
import { isSubscriptionSelectionRequired } from "../../lib/subscription-access";

export function AuthRequired({ title }: { title: string }) {
  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">Раздел доступен после входа и активного demo или подписки.</p>
        </header>
        <div className="auth-actions">
          <Link className="button" href="/login">
            Войти
          </Link>
          <Link className="button secondary" href="/register">
            Создать demo
          </Link>
        </div>
      </section>
    </AppShell>
  );
}

export function AccessClosed({ title }: { title: string }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const shouldRedirect = isSubscriptionSelectionRequired(user?.company);
  const isEducationRoute = pathname === "/education" || pathname.startsWith("/education/");
  const isEducationCompanyTypeBlocked =
    !shouldRedirect && isEducationRoute && !canAccessEducationSection(user?.company, user?.platformRoles ?? []);
  const description = isEducationCompanyTypeBlocked
    ? "Раздел обучения сейчас доступен только заготовителям. Остальные рабочие разделы остаются открыты."
    : shouldRedirect
      ? "Срок доступа истёк. Выберите доступ в окне подписки, чтобы продолжить работу."
      : "Для этого раздела нужен другой уровень доступа. Личный кабинет, биллинг и поддержка остаются доступны.";
  const actionHref = isEducationCompanyTypeBlocked
    ? "/news"
    : shouldRedirect
      ? "/news"
      : accountProfileModalHref("subscription");
  const actionLabel = isEducationCompanyTypeBlocked ? "К новостям" : shouldRedirect ? "К новостям" : "Открыть подписку";

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">{description}</p>
        </header>
        <div className="auth-actions">
          <Link className="button" href={actionHref}>
            {actionLabel}
          </Link>
        </div>
      </section>
    </AppShell>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="page-header">
      <h1 className="page-title">{title}</h1>
      {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
    </header>
  );
}

// CTA «обновить тариф» — показываем поверх контента, к которому у текущей
// компании нет доступа. Возвращает null, если апгрейд не нужен (extended-план,
// сотрудник платформы и т.п.).
export function resolveUpgradeCta(
  user: ReturnType<typeof useAuth>["user"],
): { title: string; description: string; buttonLabel: string } | null {
  if (!user || !user.company || (user.platformRoles?.length ?? 0) > 0) {
    return null;
  }
  const status = user.company.status;
  const plan = user.company.subscriptionPlan;
  if (status === "active" && plan === "extended") {
    return null;
  }
  if (status === "active" && plan === "basic") {
    return {
      title: "Расширенный доступ",
      description: "Откройте продвинутые модули обучения и дополнительные материалы.",
      buttonLabel: "Расширенный доступ",
    };
  }
  return {
    title: "Полный доступ",
    description: "Активируйте подписку, чтобы открыть все модули обучения.",
    buttonLabel: "Полный доступ",
  };
}

export function ErrorState({ title, message }: { title: string; message: string | null }) {
  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">Не удалось загрузить данные. Попробуйте обновить страницу позже.</p>
        </header>
        {message ? (
          <StatusPill as="p" variant="danger">
            {message}
          </StatusPill>
        ) : null}
      </section>
    </AppShell>
  );
}
