# ЭкоПлатформа

B2B-платформа отрасли обращения с отходами: новости, индексы цен на вторсырьё,
обучающие модули и база знаний — с CMS для контента, подписками компаний,
модерацией и мультипользовательскими аккаунтами.

**MVP в проде:** https://ecoplatform.pro · Текущий этап — приёмка владельцем,
дизайн-правки и точечные доработки. Как развёрнуто и как обновлять —
[`deploy/PRODUCTION.md`](deploy/PRODUCTION.md).

## Стек

| Слой | Технологии |
|---|---|
| Монорепо | Turborepo + pnpm (workspaces) |
| Backend (`apps/api`) | NestJS, Prisma, PostgreSQL 18, Redis |
| Frontend (`apps/web`) | Next.js (App Router), React, Tiptap, dnd-kit |
| Общий код (`packages/shared`) | TypeScript-типы, DTO (Zod), бизнес-правила, content-blocks |
| Инфраструктура | Docker, Caddy (HTTPS), Timeweb VPS + Managed PostgreSQL + S3 |

## Быстрый старт (локально)

```bash
# 1. Зависимости
pnpm install

# 2. Переменные окружения (заполнить секреты)
cp .env.example .env
#    JWT-секреты: openssl rand -hex 32
#    Локальные пароли dev-учёток: SEED_ADMIN_PASSWORD, SEED_DEMO_PASSWORD

# 3. Поднять локальные Postgres (:5433) и Redis (:6379)
docker compose -f docker-compose.dev.yml up -d

# 4. Подготовить БД
pnpm --filter @ecoplatform/api prisma:generate
pnpm --filter @ecoplatform/api prisma:migrate
pnpm --filter @ecoplatform/api seed

# 5. Запуск разработки (api :4000, web :3000)
pnpm dev
```

Полезно знать:

- Если Redis недоступен, API продолжает работать через БД и in-memory throttler.
- Web в dev принудительно запускается на Webpack (не Turbopack) — это обход
  нестабильного Turbopack crash-loop при локальной приёмке.
- Server-only sanitizer для HTML подключается отдельной точкой входа
  `@ecoplatform/shared/sanitize-html`.

### Demo-учётки после `seed`

- Админ: `admin@ecoplatform.local` (пароль из `SEED_ADMIN_PASSWORD`).
- Пользователь: `demo@ecoplatform.local` (пароль из `SEED_DEMO_PASSWORD`).

`seed` также создаёт 5 заглушек юр-документов v1.0.0 (privacy / terms /
personal-data — обязательные, cookies / offer — опциональные) и согласия админа
на обязательные (иначе `auth/me.requiresReConsent` блокирует кабинет).

## Проверки

```bash
pnpm lint              # tsc --noEmit во всех пакетах
pnpm test              # unit-тесты (shared / web / api)
pnpm test:integration  # integration-тесты api против реальной PostgreSQL
pnpm build             # tsc + next build
pnpm format:check      # prettier
```

Integration-тесты создают отдельную БД `ecoplatform_test` в том же
Postgres-контейнере и сами накатывают миграции — локальная dev-БД не
затрагивается. Прогон разбит на доменные файлы `apps/api/src/*.integration.test.ts`
(общий харнесс — в `apps/api/src/test/`) и идёт последовательно (одна тест-БД).
GitHub Actions гоняет проверки и integration-тесты на каждый push в `main`.

## Архитектура

```
apps/
  api/                         NestJS-сервер
    prisma/
      schema.prisma            модель PostgreSQL
      migrations/              30 SQL-миграций (2026-05-20 … 2026-06-04)
      seed.ts                  сидер admin/demo + юр-документы
    src/
      auth/                    регистрация, вход, JWT, refresh-cookie, lockout,
                               экспорт/удаление аккаунта (workflow-хелперы рядом)
      billing/                 подписки, места (seats), ручная активация, cron-уведомления
      content/services/        CMS-домены: news / indices / learning / knowledge-base
                               + common; объёмная логика — в *-*.helpers.ts
      moderation/              жалобы, кейсы, санкции (case/decision/sanction-хелперы)
      files/                   upload в S3 + WebP/AVIF + FileReference (helpers рядом)
      admin/                   dashboard, users, companies, staff, journals, settings
      legal/ support/ notifications/ email/   документы, тикеты, in-app + email
      scheduler/               распределённый cron на advisory-lock
      redis/ health/ common/   кэш сессий, throttler, health-checks, CSRF, пагинация
      test/                    харнесс integration-тестов (context, helpers, setup)
  web/                         Next.js App Router
    app/                       публичные и админ-маршруты
    src/
      views/                   страницы по доменам:
                               account, admin/* (13 панелей), news, indices,
                               learning, knowledge-base (content-blocks — рендер блоков)
      components/              app-shell, auth (формы/поля/степпер), editor
      components/editor/ + lib/editor/   Tiptap-редактор CMS + сериализатор «блоки ↔ Tiptap»
      lib/api/                 типизированный клиент `api.news.list()` с авто-refresh и CSRF
      lib/auth.tsx             AuthProvider с восстановлением через HttpOnly refresh-cookie
packages/
  shared/                      slug, access-правила, content-blocks, sanitize-html,
                               price-index, dto (Zod), api-response (типы ответов)
```

CMS-редактор — единый WYSIWYG на **Tiptap** со slash-командами; на хранении формат
остаётся блочным, конвертацию обеспечивает сериализатор
`apps/web/src/lib/editor/serializer.ts` (покрыт unit-тестами).

## Прод-готовность

- **Health-checks** (`@nestjs/terminus`): `/api/health` (liveness), `/api/ready`
  (Postgres/Redis/S3), `/api/health/deep` (admin-диагностика).
- **Безопасность:** Helmet + боевая CSP, CSRF double-submit, lockout после 10
  неудачных логинов, приватный S3-бакет со signed-URL для платных файлов.
- **Отказоустойчивость:** graceful shutdown, `trust proxy`, gzip/Brotli,
  Prisma connection pooling, Redis session-cache с in-memory fallback.
- **Распределённый cron** на `pg_try_advisory_xact_lock` (реплики не дублируют
  job'ы): почасовая проверка биллинга и ночные очистки — удалённые аккаунты,
  orphan-файлы, email-challenges, устаревшие записи (сессии / idempotency /
  доставки уведомлений).
- **Медиа/CDN:** WebP/AVIF-варианты обложек через `sharp`, immutable cache на
  `/brand/*` и `/avatars/*`.
- **Бэкапы:** ежедневные физические + `pg_dump` в S3 (retention 90 дней),
  безопасная процедура отката миграций (см. `deploy/PRODUCTION.md`).

## Деплой

Прод развёрнут на **Timeweb VPS** (Ubuntu + Docker) обычным `docker compose`
(`docker-compose.prod.yml`: Caddy + web + api + redis). БД — Timeweb Managed
PostgreSQL (приватная сеть), файлы — Timeweb S3, HTTPS — Caddy/Let's Encrypt.
Timeweb App Platform **не используется** (его сборщик нестабилен с монорепо).

Обновление прода — после `git push` на сервере:

```bash
cd /root/ecoplatform && git pull && \
  docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
```

Новые миграции применяются автоматически при старте `api`
(`prisma migrate deploy`). **Перед изменением схемы — бэкап БД.** Полный runbook
(устройство, обновления, как не сломать БД, восстановление прав) —
[`deploy/PRODUCTION.md`](deploy/PRODUCTION.md).

## Как читать код без опыта разработки

- Русские комментарии стоят рядом с неочевидной бизнес-логикой: demo-доступ и
  его истечение, закрытие разделов в статусе `pending_deletion`, права
  поддержки, публикация контента, расчёт индексов и структура блоков, lockout,
  идемпотентность ручной активации, перенумерация позиций в деревьях.
- Крупные сервисы — это «оркестраторы»: публичные методы остаются в `*.service.ts`,
  а объёмные детали вынесены в соседние `*-*.helpers.ts` с тем же префиксом.

## Осознанно отложено

- OpenAPI/Swagger для внешней документации API.
- Pre-MVP-модули (форум, магазин решений) заведены в enum'ах и сайдбаре, но без
  UI — это сделано осознанно как «фундамент на вырост», чтобы не двигать позже
  миграции с реальными платежами на проде. Торговая площадка открыта
  авторизованным пользователям; платные действия проверяются в сервисах.
