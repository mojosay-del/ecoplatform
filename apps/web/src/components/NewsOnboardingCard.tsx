"use client";

import Link from "next/link";
import { BarChart3, GraduationCap, Newspaper, X } from "lucide-react";
import type { AuthMeUser } from "@ecoplatform/shared";
import { formatOnboardingDemoDate } from "./news-onboarding-state";

type Props = {
  user: AuthMeUser;
  onDismiss: () => void;
};

const onboardingLinks = [
  { href: "/news", label: "Свежие новости", icon: Newspaper },
  { href: "/indices", label: "Индексы цен", icon: BarChart3 },
  { href: "/education", label: "Курс «Закупка сырья»", icon: GraduationCap },
];

export function NewsOnboardingCard({ user, onDismiss }: Props) {
  const demoDate = user.company?.demoEndsAt ? formatOnboardingDemoDate(user.company.demoEndsAt) : null;
  if (!demoDate) return null;

  return (
    <section className="news-onboarding-card" aria-label="Быстрый старт">
      <div className="news-onboarding-copy">
        <p className="news-onboarding-eyebrow">Быстрый старт</p>
        <h2>
          Добро пожаловать, {user.firstName}! Пробный доступ до {demoDate}.
        </h2>
        <p>Что попробовать в первую очередь:</p>
      </div>
      <nav className="news-onboarding-links" aria-label="Что попробовать в первую очередь">
        {onboardingLinks.map((item) => {
          const Icon = item.icon;
          return (
            <Link className="news-onboarding-link" href={item.href} key={item.href}>
              <Icon aria-hidden="true" size={17} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <button className="news-onboarding-close" type="button" onClick={onDismiss} aria-label="Закрыть приветствие">
        <X aria-hidden="true" size={18} />
        <span>Закрыть</span>
      </button>
    </section>
  );
}
