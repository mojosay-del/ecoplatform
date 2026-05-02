---
title: Документация ЭкоПлатформы
status: draft
updated: 2026-04-23
source: —
---

## 1. О продукте

ЭкоПлатформа — SaaS-платформа для рынка вторсырья: заготовителей, трейдеров и переработчиков.

Платформа объединяет в одной системе:
- торговую площадку на карте
- ценовые индексы
- новости рынка
- обучающие материалы
- базу знаний и документацию
- справочники
- прикладные калькуляторы и рабочие инструменты
- магазин готовых решений
- форум

## 2. Структура документации

### 00-product/ — продуктовый контекст
- [context.md](./00-product/context.md) — вводный контекст проекта
- [master.md](./00-product/master.md) — мастер-документ продукта

### 01-companies/ — типы компаний и кабинеты
- [overview.md](./01-companies/overview.md) — общая структура типов компаний
- [zagotovitel.md](./01-companies/zagotovitel.md) — заготовитель
- [treider.md](./01-companies/treider.md) — трейдер
- [pererabotchik.md](./01-companies/pererabotchik.md) — переработчик

### 02-roles/ — платформенные роли
- [overview.md](./02-roles/overview.md) — общая ролевая модель
- [content-manager.md](./02-roles/content-manager.md) — контент-менеджер
- [moderator.md](./02-roles/moderator.md) — модератор
- [admin.md](./02-roles/admin.md) — администратор платформы

### 04-marketplace/ — торговая площадка
- [overview.md](./04-marketplace/overview.md) — общая спецификация
- [listings.md](./04-marketplace/listings.md) — объявления
- [offers.md](./04-marketplace/offers.md) — ценовые предложения
- [auction.md](./04-marketplace/auction.md) — механика закрытого аукциона
- [acceptance.md](./04-marketplace/acceptance.md) — принятие предложений и финальные состояния
- [archive.md](./04-marketplace/archive.md) — архив объявлений и предложений
- [public-ui.md](./04-marketplace/public-ui.md) — публичный интерфейс
- [cabinet-zagotovitel.md](./04-marketplace/cabinet-zagotovitel.md) — кабинет заготовителя
- [cabinet-pererabotchik.md](./04-marketplace/cabinet-pererabotchik.md) — кабинет переработчика
- [cabinet-treider.md](./04-marketplace/cabinet-treider.md) — кабинет трейдера
- [reviews-and-ratings.md](./04-marketplace/reviews-and-ratings.md) — отзывы и рейтинги
- [moderation.md](./04-marketplace/moderation.md) — модерация
- [notifications.md](./04-marketplace/notifications.md) — уведомления
- [limits.md](./04-marketplace/limits.md) — лимиты
- [other-integrations.md](./04-marketplace/other-integrations.md) — связь с другими модулями
- [roles.md](./04-marketplace/roles.md) — ролевая модель

### 05-content/ — контентные модули
- [news/README.md](./05-content/news/README.md) — новости
- [price-indices/README.md](./05-content/price-indices/README.md) — индексы цен
- [knowledge-base/README.md](./05-content/knowledge-base/README.md) — база знаний
- [education/README.md](./05-content/education/README.md) — обучающий раздел
- [references/README.md](./05-content/references/README.md) — справочники

### 06-tools/ — прикладные инструменты
- [ratings-reviews.md](./06-tools/ratings-reviews.md) — рейтинги и отзывы
- [calculators.md](./06-tools/calculators.md) — калькуляторы

### 07-platform/ — платформенные сервисы
- [auth-and-onboarding.md](./07-platform/auth-and-onboarding.md) — аутентификация и онбординг
- [subscriptions-and-billing.md](./07-platform/subscriptions-and-billing.md) — подписки и биллинг
- [admin-panel.md](./07-platform/admin-panel.md) — административная панель
- [notifications.md](./07-platform/notifications.md) — платформенные уведомления
- [moderation.md](./07-platform/moderation.md) — модерация и пользовательский контент

### 08-architecture/ — архитектурные решения
- [tech-stack.md](./08-architecture/tech-stack.md) — технологический стек
- [monorepo.md](./08-architecture/monorepo.md) — monorepo и структура репозитория
- [maps-provider.md](./08-architecture/maps-provider.md) — картографический провайдер
- [geo-logic.md](./08-architecture/geo-logic.md) — геологика
- [data-model.md](./08-architecture/data-model.md) — модель данных

### 09-forum/ — форум
- [README.md](./09-forum/README.md) — общая спецификация

### 10-solutions-shop/ — магазин готовых решений
- [README.md](./10-solutions-shop/README.md) — общая спецификация

### Корневые документы
- [GLOSSARY.md](./GLOSSARY.md) — глоссарий терминов
- [CONVENTIONS.md](./CONVENTIONS.md) — правила ведения документации

## 3. Статус документов

Все документы имеют YAML front matter со статусом `status: draft`, датой обновления `updated: 2026-04-23` и ссылкой на исходный `.txt`-файл.

Часть документов — стабы со стандартной формулировкой «Документ ещё не утверждён. Раздел будет зафиксирован отдельно.» Эти разделы подлежат отдельной фиксации.
