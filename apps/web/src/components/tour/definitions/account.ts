import type { TourDefinition } from "../tour-types";

// Личный кабинет (/account/profile). Все шаги опциональные: у платформенного
// staff нет кольца и плиток — ручной запуск с «?» покажет ему то, что есть.
export const accountTour: TourDefinition = {
  key: "account",
  steps: [
    {
      anchor: "account-ring",
      title: "Заполненность профиля",
      body: "Кольцо показывает прогресс: нажмите на него — чек-лист подскажет, чего не хватает до 100%.",
      placement: "left",
      optional: true,
    },
    {
      anchor: "account-tiles",
      title: "Разделы кабинета",
      body: "Подписка, оплата, сессии, уведомления, приватность и сотрудники — каждая плитка открывает свой раздел.",
      placement: "bottom",
      optional: true,
    },
    {
      anchor: "account-cards",
      title: "Данные и компания",
      body: "Личные данные и реквизиты компании редактируются прямо в карточках — наведите на строку и нажмите «Изменить».",
      placement: "top",
      optional: true,
    },
  ],
};
