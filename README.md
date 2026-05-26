# ЭкоПлатформа MVP

Репозиторий содержит продуктовую документацию и рабочую кодовую базу MVP на Turborepo + pnpm.

Текущее состояние и ход работы — в [PROJECT_STATUS.md](PROJECT_STATUS.md). История аудита и план волн — в [audit/](audit/). Архитектурные решения — в [docs/08-architecture/](docs/08-architecture/).

## Карта проекта

```
apps/
  api/               NestJS-сервер, Prisma, миграции, integration-тесты
    prisma/
      schema.prisma  модель PostgreSQL (актуальная)
      migrations/    26 SQL-миграций от 2026-05-20 до 2026-05-26
      seed.ts        сидер для admin/demo и юр-документов
    src/
      auth/          регистрация, вход, JWT, refresh-cookie, lockout, экспорт данных
      billing/       подписки, ручная активация, cron-уведомления
      content/       4 доменных сервиса CMS (news/indices/learning/knowledge-base) + Common
      moderation/    жалобы, кейсы, санкции, ограничения модулей
      notifications/ in-app + delivery в email-канал (заготовка)
      legal/         публичные документы и согласия пользователей
      support/       тикеты пользователей и админский UI
      files/         upload в S3 + WebP/AVIF варианты + FileReference
      admin/         users, companies, staff, journals, settings
      redis/         session cache, throttler storage
      scheduler/     hourly billing-check + nightly cleanup-deleted-accounts (advisory-lock)
      common/        CSRF guard, JwtAuthGuard, pagination, sanitize, simple-zip
      app.integration.test.ts  110 сквозных тестов
  web/               Next.js App Router, Tiptap-редактор, dnd-kit
    app/             публичные и админ-маршруты
      (login,register,forgot-password,news,indices,education,
       knowledge-base,account,notifications,legal,admin)
    src/
      components/    AppShell, AuthForms, BlocksEditor, RichTextEditor, CookieConsent,
                     NotificationBell, UserSupportDrawer, Admin*View, FileUploadField
      views/         публичные view-страницы (news/indices/learning/knowledge-base/account)
                     + content-blocks для рендеринга блоков
      lib/api/       типизированный namespace `api.news.list()` / `api.billing.updateCompanyProfile()`
                     + auto-refresh + CSRF + apiDownload
      lib/auth.tsx   AuthProvider с восстановлением через HttpOnly refresh-cookie
packages/
  shared/            slug, индексы цен, content-blocks, sanitize-html,
                     access-правила, DTO для регистрации/legal/profile,
                     ответы API (NewsListItem, BillingStatus, AuthMeUser и т.д.)
docs/                продуктовая и архитектурная документация
audit/               ROADMAP волн + PROGRESS-журнал + SIDE-FINDINGS + Lighthouse baseline (старые отчёты — в audit/archive/)
docker-compose.yml   локальный Postgres 16 :5433 + Redis 7 :6379
```

## Локальный запуск

1. Установить зависимости:

   ```bash
   pnpm install
   ```

2. Скопировать переменные окружения и заполнить секреты:

   ```bash
   cp .env.example .env
   # Сгенерировать JWT-секреты: openssl rand -hex 32
   ```

3. Поднять Postgres и Redis локально:

   ```bash
   docker compose up -d
   ```

   Контейнеры слушают `:5433` (Postgres) и `:6379` (Redis). `DATABASE_URL` и `REDIS_URL` в `.env.example` уже настроены. Если Redis недоступен, API продолжает работать через БД и in-memory throttler.

4. Подготовить базу:

   ```bash
   pnpm --filter @ecoplatform/api prisma:generate
   pnpm --filter @ecoplatform/api prisma:migrate
   pnpm --filter @ecoplatform/api seed
   ```

5. Запустить разработку:

   ```bash
   pnpm dev
   ```

   API — на http://localhost:4000, web — на http://localhost:3000.

## Проверки

```bash
pnpm lint                  # tsc --noEmit во всех пакетах
pnpm test                  # 60 unit-тестов (shared 7, web 7, api 46)
pnpm test:integration      # 110 integration-тестов против ecoplatform_test
pnpm build                 # tsc + next build
pnpm format:check          # prettier
```

Integration-тесты создают отдельную БД `ecoplatform_test` в том же Postgres-контейнере и автоматически применяют миграции — локальная dev-БД не затрагивается. GitHub Actions гонит `static-checks` (prettier/lint/test/build) и `integration` (Postgres 18 service) на каждый push в main.

## Demo-доступы после seed

- Админ: `admin@ecoplatform.local` / `Admin123456`
- Demo-пользователь: `demo@ecoplatform.local` / `Demo123456`

После seed также создаются 5 placeholder-юр-документов v1.0.0 (privacy/terms/personal-data — обязательные, cookies/offer — опциональные) и админский `ConsentRecord` на обязательные — иначе `auth/me.requiresReConsent` блокирует кабинет.

## Целевая БД для деплоя

Для размещения на Timeweb выбрана **PostgreSQL 18** (см. секцию «Целевая БД для деплоя» в [PROJECT_STATUS.md](PROJECT_STATUS.md) и подробности по env/SSL/бэкапам в [docs/08-architecture/deploy.md](docs/08-architecture/deploy.md)).

## Что есть в проде-готовности

- Health-checks `/api/health` и `/api/ready` через `@nestjs/terminus`.
- Docker: multi-stage `Dockerfile` для api и web, Next.js `output: standalone`, Prisma `binaryTargets` под musl и debian.
- Graceful shutdown (`app.enableShutdownHooks()`), `trust proxy`, CORS с `maxAge`, gzip/Brotli compression.
- Helmet security headers + CSP report-only на web; CSRF double-submit; lockout по 10 неудачным логинам.
- Redis: session-cache (60 сек), Redis-backed throttler с in-memory fallback.
- Distributed cron через `pg_try_advisory_xact_lock` — несколько реплик API не дублируют job'ы.
- Prisma connection pooling (`connection_limit=20` по умолчанию).
- CDN cache headers на `/brand/*` и `/avatars/*` (immutable, max-age=1 год).
- WebP/AVIF варианты cover-изображений через `sharp`.
- Backup/runbook для Timeweb: daily physical backups, ежедневный `pg_dump` в S3 с retention 90 дней и безопасная процедура отката Prisma-миграций.
- Lighthouse baseline зафиксирован: см. [audit/lighthouse-baseline.md](audit/lighthouse-baseline.md).

## Как читать код без опыта разработки

- Русские комментарии стоят рядом с неочевидной бизнес-логикой: demo-доступ, закрытие функциональных разделов после истечения demo и в статусе `pending_deletion`, права поддержки, публикация контента, расчёт индексов и структура блоков, lockout, идемпотентность ручной активации.
- Pre-MVP-модули (форум, торговая площадка, магазин решений) уже отмечены в enum'ах и сайдбаре, но без UI — это сделано осознанно как «фундамент на вырост», чтобы не двигать миграции с реальными платежами на проде позже. Описание подхода — в `audit/ROADMAP.md` (Волна 7).
- Журнал работы по каждой задаче — в `audit/PROGRESS.md`. Там по датам видно, кто и что закрыл.
