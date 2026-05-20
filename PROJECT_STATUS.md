# Ход разработки ЭкоПлатформы MVP

## Текущий этап

Этап: MVP-каркас прошёл полную сквозную проверку — поднимается локально, проходит сценарий регистрация → demo → истечение → ручная активация, покрыт автоматическими integration-тестами.

Цель следующего этапа: довести продуктовую функциональность до полноценного состояния — визуальный блочный редактор CMS, физический файловый upload, расширение покрытия и подготовка к деплою на Timeweb.

## Что уже сделано

- Создан Turborepo + pnpm monorepo: `apps/web`, `apps/api`, `packages/shared`.
- Реализован Next.js App Router интерфейс с основными разделами: новости, индексы, обучение, база знаний, кабинет, регистрация и вход.
- Реализованы админ-экраны для CMS: новости, индексы, обучение, база знаний, ручная подписка и поддержка.
- Реализован NestJS API: auth, JWT access token, HttpOnly refresh cookie, RBAC, demo-доступ, billing, CMS, индексы, обучение, база знаний, support tickets, metadata для файлов.
- Реализована Prisma-схема PostgreSQL и первая миграция `apps/api/prisma/migrations/20260520165000_init`.
- Shared-пакет содержит статусы, DTO, demo/access-gating, slug, расчёт индексов цен и валидацию content blocks.
- Добавлены seed-данные: admin, demo-user, категория макулатуры, индекс гофрокартона, новости, обучение и статья базы знаний.
- Добавлен `docker-compose.yml` для локального Postgres 16 на порту **5433** (5432 часто занят локальным Postgres разработчика).
- Зафиксирован выбор управляемой БД для деплоя: **Timeweb PostgreSQL 18** (см. секцию «Решение по БД»).
- Подключён `dotenv` в `apps/api/src/main.ts` и `apps/api/prisma/seed.ts` — корневой `.env` теперь читается автоматически, без ручного экспорта переменных.
- Переведён `packages/shared` с ESM на CommonJS — собранный пакет корректно подгружается из NestJS и Next.js без strict-resolution ошибок Node.
- Переехали с `tsx watch` на `ts-node-dev` для dev-режима API — теперь NestJS DI получает `design:paramtypes` метаданные и приложение корректно стартует.
- Реэкспорт `JwtModule` из `AuthModule` — устранена ошибка `Nest can't resolve dependencies of the JwtAuthGuard (?, PrismaService)` в защищённых эндпоинтах.
- Vitest сконфигурирован с `unplugin-swc` (`apps/api/vitest.config.ts`) — теперь и unit, и integration-тесты получают корректные decorator metadata.
- Написаны integration-тесты на критические пути (`apps/api/src/app.integration.test.ts`, 10 тестов): auth (register/login/me/duplicates), demo-gating, ручная активация, CMS publish, ownership в support.
- Тестовая БД (`ecoplatform_test`) автоматически создаётся и мигрируется через `vitest globalSetup` (`apps/api/src/test/integration-global-setup.ts`).

## Решение по БД для деплоя

Целевая БД: **Timeweb PostgreSQL 18**. Альтернативы из доступных в Timeweb (MySQL, MongoDB, ClickHouse, Redis, OpenSearch и др.) не подходят:

- Prisma datasource в `apps/api/prisma/schema.prisma:6` уже зафиксирован как `postgresql`.
- Готовая миграция и сидер написаны под PostgreSQL.
- В продуктовой документации (`docs/08-architecture/tech-stack.md:21-25`) PostgreSQL — фиксированный выбор стека.
- Supabase — это тоже Postgres, но с собственной авторизацией и хранилищем, что не нужно: MVP уже имеет свой JWT + RBAC.

Redis (запланирован в tech-stack как кеш) сейчас не используется в MVP — провижить отдельно не нужно до момента появления зависимости в коде.

## Важные решения

- Demo приравнен к basic-доступу только пока `demoEndsAt` в будущем.
- После истечения demo функциональные разделы API закрываются, но `/account`, `/billing/status` и `/support/tickets` остаются доступны после входа.
- Frontend больше не показывает demo-контент без входа или при ответах 401/403: вместо этого показывает экран входа или закрытого доступа.
- Ручная оплата остаётся через администратора: `POST /api/admin/billing/manual-subscriptions` с полями `companyId`, `plan`, `endsAt`, `reason`.
- Content blocks хранятся как `type + payload Json`; новости и уроки валидируются разными схемами, чтобы специальные блоки базы знаний не попадали в неподходящие разделы. Параграф ожидает `payload.markdown` (а не `text`) — это контролирует `newsBlockSchema` / `lessonBlockSchema`.
- Поддержка проверяет принадлежность тикета компании перед ответом пользователя; чужая компания получает 404 (не 403) при попытке ответа на чужой тикет.
- Физический upload adapter пока не подключён: API создаёт только metadata `FileAsset` и dev `storageKey`.
- В исходной попытке dev-режима использовались `tsx watch` + `node dist/main.js`. Оба не работали (DI и ESM-резолюция Node). Сейчас рабочий dev — `ts-node-dev`, прод — `node dist/main.js` (shared переведён на CJS).

## Незавершённые задачи

- Поднять реальный визуальный блочный редактор CMS вместо JSON-форм.
- Подключить реальный файловый upload adapter (S3-совместимое хранилище) вместо metadata-only MVP.
- Развернуть приложение на Timeweb (DNS, env-переменные, миграции против Timeweb Postgres).
- Расширить integration-тесты на CRUD CMS (индексы, обучение, база знаний), фронт-E2E через Playwright.
- Подключить Redis по мере появления потребности (кеш, очереди).

## Локальный запуск

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres                         # Postgres 16 на :5433
pnpm --filter @ecoplatform/api prisma:generate
pnpm --filter @ecoplatform/api prisma:migrate         # migrate deploy
pnpm --filter @ecoplatform/api seed
pnpm dev                                              # api на :4000, web на :3000
```

Учётки после сида: `admin@ecoplatform.local / Admin12345`, `demo@ecoplatform.local / Demo12345`.

## Проверки

```bash
pnpm lint                                             # tsc --noEmit во всех пакетах
pnpm test                                             # 10 unit-тестов (shared 6, api 2, web 2)
pnpm build                                            # tsc + next build
pnpm --filter @ecoplatform/api test:integration       # 10 integration-тестов против ecoplatform_test
```

## Последняя проверка

Дата: 2026-05-20.

Результат:

- `pnpm lint` — успешно (4/4 пакета).
- `pnpm test` — успешно, 10 unit-тестов.
- `pnpm build` — успешно (3/3).
- `pnpm --filter @ecoplatform/api test:integration` — успешно, 10 integration-тестов; тестовая БД `ecoplatform_test` создаётся автоматически.
- Сквозной сценарий через curl: регистрация → demo (200 на /news) → истечение demo (403 на /news, 200 на /billing/status) → ручная активация (admin POST `/admin/billing/manual-subscriptions`) → восстановленный доступ (200 на /news) → CMS draft+publish → support ownership — все шаги прошли.
- Web (`pnpm --filter @ecoplatform/web dev`) поднимается на :3000, все 15 маршрутов отдают 200.
