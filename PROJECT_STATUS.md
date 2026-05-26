# Ход разработки ЭкоПлатформы MVP

Дата последнего обновления: 2026-05-27.

## Текущий этап

Закрыт большой блок «фундамента под рост»: юридические документы и согласия (Волна 6), полиморфные обсуждения и расширенная модель компании (Волна 7), Redis + infinite scroll + CDN/cache + distributed cron + Lighthouse baseline (Волна 8), HTTP-заголовки безопасности, CSRF, защита от перебора логина, экспорт данных по 152-ФЗ, запрос удаления аккаунта, audit-trail before/after, лимиты файлов, политика новых паролей и документ политики безопасности (Волна 9 — 11/11). Волна 10 закрыта: структурное логирование pino + `LOG_LEVEL`, Sentry error tracking, Prometheus metrics, backup/runbook, Playwright smoke-test, расширенные health-checks и алерты; distributed tracing осознанно отложен как опциональный post-MVP пункт.

Текущий рабочий блок — Волна 11: UX, дизайн-система и сайдбар.

Волна 11.1 закрыта: дизайн-токены вынесены в `apps/web/src/styles/tokens.css`, а `globals.css` переведён с прямых цветов на CSS-переменные.

Целевой следующий шаг: Волна 11.2 — типографическая иерархия.

## Что уже сделано

### Каркас и базовые модули (Волны 1–5, май 2026)

- Turborepo + pnpm monorepo: `apps/web`, `apps/api`, `packages/shared`.
- Next.js App Router: лента новостей, индексы цен, обучение, база знаний, кабинет, регистрация/вход, уведомления, юр-страницы.
- Админ-разделы CMS: новости, индексы, обучение, база знаний, поддержка, биллинг с ручной активацией, пользователи, сотрудники, компании, журналы действий, настройки платформы, модерация (жалобы, санкции, блоки).
- NestJS API: auth + JWT access + HttpOnly refresh-cookie, RBAC (платформенные роли), demo-доступ, ручная подписка, CMS (4 типа контента), индексы цен, поддержка, файлы-метаданные, in-app уведомления, модерация, юр-документы.
- Prisma + PostgreSQL: 26 миграций к 2026-05-26, актуальная схема в `apps/api/prisma/schema.prisma`.
- Перфоманс-индексы: 13 составных индексов на NewsPost/Comment/SupportTicket/Subscription/LearningModule и др.
- Пагинация envelope `{ items, total, hasMore }` на всех листингах публичной части и админки.
- 113 integration-тестов в `apps/api/src/app.integration.test.ts` + автоматический setup тестовой БД `ecoplatform_test`.
- Unit-тесты: 7 в `packages/shared`, 10 в `apps/web`, 73 в `apps/api`.
- GitHub Actions CI: `static-checks` (prettier-check + lint + test + build) и `integration` (Postgres 18 service).
- Docker: multi-stage `Dockerfile` для api и web, `output: standalone` в Next.js, `binaryTargets` в Prisma под musl и debian.
- Локальный `docker-compose.yml`: Postgres 16 на `:5433` + Redis 7 на `:6379`.
- Health-check через `@nestjs/terminus`: `/api/health` (liveness), `/api/ready` (Postgres/Redis/S3 readiness), `/api/health/deep` (admin-only диагностика).
- `Dockerfile` + полный deploy-документ `docs/08-architecture/deploy.md` (env, миграции, SSL, бэкапы, CDN, чек-лист).

### Юридический фундамент (Волна 6)

- Модели `LegalDocument` (с версией и `isActive`) и `ConsentRecord` (с IP и user-agent).
- Публичные страницы `/legal/{privacy,terms,personal-data,cookies,offer}` через общий `LegalDocumentPage`.
- Cookie-баннер `CookieConsent`: 3 кнопки, категории, флаги `window.__ANALYTICS_ENABLED__` / `__MARKETING_ENABLED__`.
- Регистрация требует чекбоксов на обязательные документы, шлёт `acceptedDocumentIds`, пишет `ConsentRecord` с источником.
- Re-consent: `/auth/me.requiresReConsent` динамически считается через `count` обязательных активных vs пользовательских согласий.
- Footer с юр-ссылками в `AppShell` и `AuthShell`.
- Seed: 5 placeholder-документов v1.0.0 (privacy/terms/personal-data — обязательные, cookies/offer — опциональные).

### Архитектурный фундамент данных (Волна 7)

- Полиморфные обсуждения: `Discussion(targetType, targetId)` вместо прямой связи `Comment.newsPostId` — комментарии можно цеплять к новостям, урокам, статьям БЗ, листингам и форумам без расщепления `Comment`.
- `Address` как самостоятельная сущность (страна/регион/город/улица/координаты/formatted/source); `Company.factualAddressId` и `structuredLegalAddressId`.
- Расширенный профиль компании: `websiteUrl`, `corporatePhone`, `corporateEmail`, `about`, `logoFileId`, `contactPerson*`, банковские реквизиты.
- UI «Реквизиты компании» в `/account → Компания`: 5 секций (Основное / Контакты / Фактический адрес / Юридический адрес / Банковские реквизиты), `PATCH /api/billing/company`.
- Enums «на вырост»: `NotificationCategory` +5 (форум, магазин, отзывы, гео, цены), `NotificationChannel` +2 (telegram, push), `SupportTicketCategory` +4 (marketplace_dispute и др.).
- Модели `PaymentMethod` (card_tinkoff / bank_invoice) и `Payment` (amount, status, purpose) — лежат под Тинькофф-Кассу, UI пока заглушен.
- Версионирование content-блоков: каждый блок имеет ключ `v: 1` в payload; миграция `jsonb_set` идемпотентно проставляет версию старым строкам.
- Модель `ApiKey` (companyId, name, keyHash bcrypt, scopes[], expiresAt) — фундамент под внешний API без UI.
- `docs/08-architecture/data-model.md` переведён в статус `current` и переписан под все домены и принципы.

### Высоконагрузочная инфраструктура (Волна 8)

- Redis: `RedisModule`, `SessionCacheService` кеширует `RequestUser` по `sessionId` на 60 секунд, инвалидация при logout/refresh/revoke/blockUser/staff role changes/company status changes.
- `ThrottlerModule` на Redis-backed storage (атомарный Lua `eval`) с in-memory fallback при недоступности Redis.
- Infinite scroll: общий `useInfiniteApiQuery` (IntersectionObserver) на `/news`, уведомлениях, support, всех admin-листингах.
- Prisma connection pooling: `PrismaService` добавляет `connection_limit=20` к `DATABASE_URL` если не задан, deploy-док фиксирует расчёт под N реплик.
- CDN/cache headers: `next.config.ts` отдаёт `/brand/*` и `/avatars/*` с `Cache-Control: public, max-age=31536000, immutable`.
- gzip/Brotli compression на API через middleware `compression`.
- Distributed cron: `pg_try_advisory_xact_lock` на hourly billing-check и daily account-cleanup — несколько реплик API не выполняют cron одновременно.
- `/api/news/tags` и AND-фильтр `/news?tags[]=...`.
- WebP/AVIF варианты для cover-изображений через `sharp.clone()`; metadata в `FileAsset.variants`.
- Lighthouse baseline зафиксирован в `audit/lighthouse-baseline.md`: `/login` 93/96/96/100, `/news` 82/92/100/100, `/education` 86/92/100/100.

### Безопасность и 152-ФЗ (Волна 9)

- HTTP security headers: Helmet на API (без CSP, чтобы Rutube-iframe не сломать), глобальные web-заголовки (X-Frame-Options DENY, X-Content-Type-Options nosniff, Permissions-Policy, HSTS, CSP report-only).
- CSRF double-submit: `csrf-token` cookie (`SameSite=Strict`, не HttpOnly) + `X-CSRF-Token` header; `GET /api/auth/csrf`; защита на `/auth/refresh` и всех POST/PATCH/DELETE кроме login/register.
- Email-enumeration timing fix: `AuthService.login()` всегда выполняет bcrypt compare против реального хэша или dummy hash для неизвестного email.
- Lockout: 10 ошибок логина за 15 минут → блок на 15 минут (`User.failedLoginAttempts`, `lockedUntil`); успешный вход после истечения сбрасывает счётчик.
- Экспорт «моих данных» по 152-ФЗ: `POST /api/auth/me/export-data` отдаёт ZIP с 14 JSON-файлами (профиль, компания, согласия, сессии, уведомления, тикеты, прогресс, комментарии, реакции, модерация, FileAsset metadata, авторский контент, audit-log). Никаких `passwordHash`/`refreshTokenHash`/`providerToken`/`keyHash`. UI: `/account → Безопасность → Мои данные`.
- Лимиты файлового аплоадера: throttle 20 запросов/мин, дневная квота 500 МБ на компанию (или на пользователя для платформенного staff без компании).
- Защита cover-image: news/learning/knowledge create/update принимают только публичные изображения; content-manager — только свои, admin может ставить чужие публичные.
- Audit-trail before/after: критические admin-действия пишут `payload.before`, `payload.after`, `payload.diff`; `/admin/journals` показывает diff как «старое → новое» с цветовым разделением.
- Политика новых паролей: общий `MIN_PASSWORD_LENGTH=12`; регистрация, смена пароля и создание staff проверяют пароль через Have I Been Pwned Pwned Passwords range API по SHA-1 k-anonymity (`/range/{first5}`) без отправки plaintext.
- Документ политики безопасности: `docs/08-architecture/security.md` фиксирует пароли, токены, CSP/CSRF/HSTS, lockout, 152-ФЗ, файлы, audit trail, операционный чек-лист и responsible disclosure.

### Наблюдаемость и операции (Волна 10)

- Структурное логирование API через `nestjs-pino`: dev-режим печатает читабельно через `pino-pretty`, prod отдаёт JSON.
- `LOG_LEVEL` управляет уровнем логов; defaults: dev=`debug`, prod=`info`, test=`silent`.
- Request-логи содержат `traceId`, `path`, `method`, `statusCode`, `durationMs`, а после JWT-auth — `userId`, `sessionId`, `companyId`, `actorRole`.
- `traceId` берётся из безопасного `X-Request-Id` или генерируется заново и возвращается в ответе как `X-Request-Id`.
- Authorization/cookie/CSRF и token/password-поля редактируются перед записью в лог.
- Sentry error tracking подключён на API и web: API отправляет только 5xx и process-level сбои, web ловит App Router/server/client render errors через `@sentry/nextjs`.
- Sentry `beforeSend` на обеих сторонах вычищает Authorization/cookie/CSRF, token/password/session, email/phone/address/bank-поля и оставляет только безопасный `user.id`.
- Sentry build-plugin и sourcemap upload включаются только при заданных CI-переменных `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + project, runtime-capture работает и без них при наличии DSN.
- Prometheus endpoint `/api/metrics` на API отдаёт text format через `prom-client`: default Node.js/process metrics, HTTP histogram, Prisma query histogram, auth cache hit/miss counters и бизнес-метрики регистраций, активных подписок и уведомлений.
- `/api/metrics` также отдаёт `db_connections{state="used|max"}` для контроля занятости Postgres-соединений.
- В production `/api/metrics` закрыт Basic Auth через `METRICS_BASIC_USER`/`METRICS_BASIC_PASSWORD`; если credentials не заданы, endpoint не раскрывает метрики.
- Backup/runbook для Timeweb: daily physical backups PostgreSQL с retention 30 копий/дней, daily `pg_dump -x --no-owner` в приватный Timeweb S3 с lifecycle 90 дней, pre-migration dump, monthly restore-smoke на dev/staging и безопасный rollback-runbook для Prisma-миграций без ручной правки `_prisma_migrations`.
- Playwright smoke-test: `apps/web/tests/smoke.spec.ts` регистрирует уникального пользователя, проверяет logout/login, `/news` и `/indices`; `pnpm test:smoke` запускает smoke через web/root scripts, а GitHub Actions `staging-smoke` стартует после успешного staging deployment.
- Расширенные health-checks: `/api/health` проверяет только живой процесс, `/api/ready` проверяет Postgres `SELECT 1`, Redis `PING` при заданном `REDIS_URL` и S3 `HeadBucket` при настроенном S3, `/api/health/deep` закрыт JWT + ролью admin и показывает безопасные детали.
- Алерты: Sentry rule для API 5xx > 10/мин и web render-errors; Prometheus rules в `ops/monitoring/ecoplatform-alerts.yml` для 5xx, p95 latency, session-cache hit rate и Postgres-соединений; Alertmanager example в `ops/monitoring/alertmanager.example.yml` без секретов в git.

### Последние закрытые задачи Волны 9

- **Пункт 9.6 — запрос на удаление аккаунта**:
  - Миграция `20260526150000_account_deletion_request`: `User.deletionRequestedAt`, `Company.statusBeforeDeletion`, новый статус `CompanyStatus.pending_deletion`, индекс по `deletionRequestedAt`.
  - `POST /api/auth/me/request-deletion`: ставит `deletionRequestedAt`, переводит компанию в `pending_deletion` с сохранением прежнего статуса, отзывает все сессии кроме текущей, шлёт security-уведомление.
  - `POST /api/auth/me/cancel-deletion`: снимает запрос, возвращает компанию в прежний статус если других «уходящих» пользователей нет.
  - Ночной cron `cleanup-deleted-accounts` (03:00, advisory-lock): удаляет пользователей с `deletionRequestedAt < now - 30 дней`, чистит orphan-`FileAsset` без `FileReference`, удаляет компании без оставшихся пользователей.
  - UI: блок «Опасная зона» в `/account → Безопасность` с двумя сценариями («Запросить удаление» / «Передумал»).
  - `AuthMeUser` расширен `deletionRequestedAt` и `deletionScheduledFor`; `companyStatuses` в shared включает `pending_deletion`.
  - 2 integration-теста: полный сценарий request → cancel и cleanup через 30 дней.
- **Пункт 9.10 — политика новых паролей**:
  - `MIN_PASSWORD_LENGTH` поднят до 12 в `@ecoplatform/shared`, UI регистрации/account/admin-staff берёт тот же минимум.
  - `PasswordPolicyService` проверяет новые пароли через Have I Been Pwned range API с `Add-Padding: true`, локальным SHA-1 suffix-сравнением, cache и fail-open при недоступности внешнего API.
  - Внешняя проверка отключается для integration/offline через `PWNED_PASSWORDS_CHECK_ENABLED=0`.
- **Пункт 9.7 — audit-trail before/after**:
  - `AdminActionLogService.recordChange()` пишет единый payload `{ before, after, diff }`.
  - Before/after подключён к ручной активации подписки, block/unblock пользователей, platform-roles, staff update, настройкам платформы, статусам компаний и admin-санкциям модерации.
  - `/admin/journals` показывает diff старого и нового значения цветами; legacy-payload остаётся JSON.
  - UI проверен локально на смене `moderation.lock_duration_minutes` 15→16→15.
- **Пункт 9.11 — документ политики безопасности**:
  - Добавлен `docs/08-architecture/security.md` со статусом `current`.
  - В `docs/README.md` добавлена ссылка на security-документ.
  - Responsible disclosure фиксирует канал `security@eco-platform.ru`, состав отчёта, правила безопасного исследования, сроки реакции и порядок публикации.

## Что осталось

### Дальше по плану (`audit/ROADMAP.md`)

- **Волна 11** — UX/дизайн-система: типографика, цвет, состояния, регистрация в 2 шага, докрутка disabled-пунктов в сайдбаре (badge «Скоро · Q3 2026»). Дизайн-токены закрыты в 11.1.
- **Волна 12** — CMS-полишинг и админ-таблицы: плотность, локализация enum-значений, breadcrumbs, скрытие cuid.
- **Волна 13** — финал MVP: контент 2 курсов, чистка постMVP-модулей из публичной выдачи, прод smoke, бэкапы.

### Тех-долг, осознанно отложенный

- 3.3 — расщепление `moderation.service.ts` (940 строк). Приватные хелперы тесно переплетены, расщепление создаст cross-service зависимости. Пересмотреть при росте >1500 строк.
- 5.2 — декомпозиция integration-тестов на доменные файлы (сейчас один файл на 113 тестов).
- 5.3 — OpenAPI/Swagger.
- 5.4 — pino + LOG_LEVEL (закрыто в Волне 10.1).
- Реальный визуальный блочный редактор CMS вместо текущего пошагового композитора блоков.
- Реальный файловый upload-adapter для прода (сейчас S3 настроен, но в dev может быть metadata-only).

## Локальный запуск

```bash
pnpm install
cp .env.example .env
docker compose up -d                                  # Postgres :5433 + Redis :6379
pnpm --filter @ecoplatform/api prisma:generate
pnpm --filter @ecoplatform/api prisma:migrate         # migrate deploy
pnpm --filter @ecoplatform/api seed
pnpm dev                                              # api на :4000, web на :3000
```

Учётки после сида:

- Админ: `admin@ecoplatform.local` / `Admin123456`
- Demo-пользователь: `demo@ecoplatform.local` / `Demo123456`

Пользовательская админ-учётка для ручных проверок: `mojosay@icloud.com` (см. `.env.example::PLATFORM_OWNER_EMAIL`) — этого аккаунта нельзя ни деактивировать, ни снять с него роль admin через админ-UI.

## Проверки

```bash
pnpm lint                                             # tsc --noEmit во всех пакетах
pnpm test                                             # 90 unit-тестов (shared 7, web 10, api 73)
pnpm build                                            # tsc + next build
pnpm test:integration                                 # 113 integration-тестов против ecoplatform_test
pnpm test:smoke                                       # Playwright smoke против PLAYWRIGHT_TEST_BASE_URL
pnpm format:check                                     # prettier
```

## Последняя зелёная проверка

Дата: 2026-05-27 (после Волны 11.1).

- `pnpm lint` — успешно (4/4).
- `pnpm test` — успешно: shared 7/7, web 10/10, api 73/73.
- `pnpm test:integration` — успешно: API integration 113/113.
- `pnpm build` — успешно (3/3).
- Browser UI-check — `/login` на `http://localhost:3000` открылся без console warning/error и без горизонтального overflow; скриншот: `/private/tmp/ecoplatform-11-1-login.png`.
- Playwright smoke — не перезапускался в 10.8 (ops/API-metrics изменение); последний зелёный прогон после 10.6: Chromium 1/1.
- `pnpm format:check` — clean.
- CSS token sanity — все `var(--...)` в `tokens.css`/`globals.css` имеют определения; прямых `#...`, `rgba(...)`, нетокенизированных `rgb(...)` в `globals.css` нет.
- `pnpm exec prettier --check ops/monitoring/ecoplatform-alerts.yml ops/monitoring/alertmanager.example.yml` — clean.
- `git diff --check` — clean.
- Lighthouse desktop (commit `b8e3101`): `/login` 93/96/96/100, `/news` 82/92/100/100, `/education` 86/92/100/100.

## Целевая БД для деплоя

**Timeweb PostgreSQL 18.** Альтернативы (MySQL, MongoDB, ClickHouse) не подходят: Prisma datasource зафиксирован на `postgresql`, миграции и сидер написаны под PG. Redis вынесен на отдельный сервис.

Подробности по env-переменным, SSL, бэкапам, rollback-runbook, CDN и чек-листу первого деплоя — в `docs/08-architecture/deploy.md`.

## Важные решения, которые легко забыть

- Demo приравнен к basic-доступу только пока `demoEndsAt` в будущем.
- После истечения demo функциональные разделы API закрываются, но `/account`, `/billing/status`, `/support/tickets`, `/notifications` остаются.
- В статусе `pending_deletion` функциональные разделы тоже закрыты (через `access.ts`), доступ к `/account` сохраняется до фактического удаления через 30 дней.
- Ручная оплата остаётся через админа: `POST /api/admin/billing/manual-subscriptions` с `Idempotency-Key`.
- Content-блоки хранятся как `type + payload Json`, в каждом payload теперь есть `v: 1` — это задел под параллельные парсеры v1/v2 без массовой миграции.
- Поддержка проверяет принадлежность тикета компании; ответ на чужой тикет — 404, не 403.
- Файлы из `/files?ids=...` фильтруются по `accessLevel: public` — приватные metadata не утекают.
- `/files/upload` доверяет только реальному magic-number MIME (через `file-type`), declared MIME из multipart игнорируется при несовпадении; HTML/SVG/executable блокируются.
- Cover-image нельзя поставить чужой приватный файл; content-manager — только свой, admin может ставить чужие публичные.
- `/admin/journals` для новых change-событий показывает before/after/diff; старые audit payload остаются читаемым JSON.
- Все unsafe-методы API требуют совпадения `csrf-token` cookie и `X-CSRF-Token` header. Исключение: `/auth/login` и `/auth/register`. Web-клиент это делает прозрачно.
- 10 неудачных логинов за 15 минут → lockout на 15 минут (`User.lockedUntil`).
- `/api/metrics` в production требует Basic Auth; credentials задаются только через env/secrets.
- Distributed cron: `billing-hourly-check` и `cleanup-deleted-accounts` берут `pg_try_advisory_xact_lock`; реплика без lock пропускает tick.
