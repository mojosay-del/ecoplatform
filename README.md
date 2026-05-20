# ЭкоПлатформа MVP

Репозиторий содержит продуктовую документацию и рабочую кодовую базу MVP на Turborepo + pnpm.

## Карта проекта

- `apps/web` — интерфейс на Next.js: `/news`, `/indices`, `/education`, `/knowledge-base`, `/account`, `/login`, `/register`, админ-разделы `/admin`.
- `apps/api` — NestJS API: авторизация, demo-доступ, ручная подписка, CMS, индексы, обучение, база знаний, файлы-метаданные и поддержка.
- `apps/api/prisma/schema.prisma` — модель PostgreSQL.
- `apps/api/prisma/migrations` — SQL-миграции.
- `apps/api/src/app.integration.test.ts` — сквозные integration-тесты против реальной БД.
- `packages/shared` — общие статусы, DTO, правила доступа, slug, индексы цен и валидация content blocks.
- `docker-compose.yml` — локальный Postgres 16 на порту 5433.
- `docs` — продуктовая документация.
- `PROJECT_STATUS.md` — актуальный ход разработки и результаты последних проверок.

## Локальный запуск

1. Установить зависимости:

```bash
pnpm install
```

2. Скопировать переменные окружения:

```bash
cp .env.example .env
```

3. Поднять Postgres локально:

```bash
docker compose up -d postgres
```

Контейнер слушает порт **5433** (5432 часто занят локальной установкой Postgres на macOS). `DATABASE_URL` в `.env.example` уже настроен на 5433.

4. Подготовить базу:

```bash
pnpm --filter @ecoplatform/api prisma:generate
pnpm --filter @ecoplatform/api prisma:migrate         # migrate deploy
pnpm --filter @ecoplatform/api seed
```

5. Запустить разработку:

```bash
pnpm dev
```

API будет на http://localhost:4000, web — на http://localhost:3000.

## Проверки

```bash
pnpm lint                                             # tsc --noEmit
pnpm test                                             # unit-тесты (быстрые, без БД)
pnpm build
pnpm --filter @ecoplatform/api test:integration       # integration против ecoplatform_test
```

Integration-тесты создают отдельную БД `ecoplatform_test` в том же Postgres-контейнере и автоматически применяют миграции — локальная dev-БД не затрагивается.

## Demo-доступы после seed

- Админ: `admin@ecoplatform.local` / `Admin12345`
- Demo-пользователь: `demo@ecoplatform.local` / `Demo12345`

## Целевая БД для деплоя

Для размещения на Timeweb выбрана **PostgreSQL 18** (см. секцию «Решение по БД» в [PROJECT_STATUS.md](PROJECT_STATUS.md)).

## Как читать код без опыта разработки

Русские комментарии стоят рядом с неочевидной бизнес-логикой: demo-доступ, закрытие функциональных разделов после истечения demo, права поддержки, публикация контента, расчёт индексов и структура блоков.
