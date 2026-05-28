# Ход разработки ЭкоПлатформы MVP

Дата последнего обновления: 2026-05-28.

## Текущий этап

Закрыт большой блок «фундамента под рост»: юридические документы и согласия (Волна 6), полиморфные обсуждения и расширенная модель компании (Волна 7), Redis + infinite scroll + CDN/cache + distributed cron + Lighthouse baseline (Волна 8), HTTP-заголовки безопасности, CSRF, защита от перебора логина, экспорт данных по 152-ФЗ, запрос удаления аккаунта, audit-trail before/after, лимиты файлов, политика новых паролей и документ политики безопасности (Волна 9 — 11/11). Волна 10 закрыта: структурное логирование pino + `LOG_LEVEL`, Sentry error tracking, Prometheus metrics, backup/runbook, Playwright smoke-test, расширенные health-checks и алерты; distributed tracing осознанно отложен как опциональный post-MVP пункт.

Волна 12 — CMS-полишинг и админ-таблицы — закрыта полностью. Разработческий audit закрыт; следующий этап — ручная приёмка MVP владельцем продукта.

Отдельный полномасштабный codebase-аудит ведётся по `CODEBASE_AUDIT_ROADMAP.md`.
На 2026-05-28 приняты `A-ROOT`, `A-CI`, `A-OPS`, `B-PRISMA`, `B-AUTH`,
`B-COMMON` и `B-ADMIN`; следующий модуль проверки — `B-BILLING`.

Волна 11.1 закрыта: дизайн-токены вынесены в `apps/web/src/styles/tokens.css`, а `globals.css` переведён с прямых цветов на CSS-переменные.

Волна 11.2 закрыта: `h1` приведены к токенам типографики, публичные заголовки выровнены по левому краю, `/news` теперь открывается с заголовком «Новости рынка».

Волна 11.3 закрыта: статусы переведены на общий `StatusPill` с вариантами `success/warning/danger/neutral/brand`; обучение, компании, поддержка, пользователи, подписки, модерация и сервисные сообщения больше не используют случайный зелёный pill по умолчанию.

Волна 11.4 закрыта: базовые `.button`, `.input`, `.textarea`, `.select` получили единые hover/focus/active/disabled состояния через state-токены в `tokens.css`; keyboard-focus видим через `--focus-ring`, а disabled-кнопки и поля теперь выглядят явно выключенными без полупрозрачной каши.

Волна 11.5 закрыта: disabled-разделы сайдбара стали «премиум-тизером» будущих фич — с badge `Скоро · Q3 2026`, описанием в tooltip, `aria-disabled`, `cursor: not-allowed` и приглушёнными иконками.

Волна 11.6 закрыта: регистрация стала двухшаговой — сначала компания, тип и ИНН, затем личные данные, доступ и согласия; кнопка «Назад» сохраняет данные обоих шагов, а ИНН валидируется на web/API и сохраняется в `Company.billingInn`.

Волна 11.7 закрыта: в `AppShell` добавлен sticky demo-баннер 36px под топбаром; он виден только demo-компаниям до истечения `demoEndsAt`, обновляет countdown каждую минуту, краснеет за 2 часа до конца, ведёт в `/account?tab=billing` и не показывается на `/admin/*`.

Волна 11.8 закрыта: в `/news` над лентой добавлена onboarding-card для нового demo-пользователя — приветствие по имени, дата окончания demo, быстрые ссылки на новости, индексы и курс «Закупка сырья», плюс скрытие через `localStorage.eco_onboarding_v1_dismissed = '1'`.

Волна 11.9 закрыта: в `/indices` над графиками добавлена таблица «За неделю» с top-3 ростом и top-3 падением индексов текущей категории, цветными процентами и anchor-ссылками на карточки в сетке.

Волна 11.10 закрыта: сетка `/indices` переведена на `auto-fit/minmax`, карточки перестали расширять страницу на мобильной ширине, а переключатели периода остаются в одну строку и скроллятся внутри карточки.

Волна 11.11 закрыта: `/news` получил chip-row тегов, dropdown «Все теги», URL-фильтр `?tag=...`, кликабельные теги на карточках и сброс infinite-scroll на `offset=0` при смене фильтра.

Волна 11.12 закрыта: точечный микро-копирайтинг улучшил `/forgot-password`, `/account`, пустые комментарии в `/news` и админские статусы/тарифы без изменения бизнес-логики.

Волна 11.13 закрыта: `/forgot-password`, 404 и error fallback’и переведены на общий `MarketingShell` без пустой правой колонки; контент центрируется, юридический footer остаётся внизу, mobile/desktop проверены без горизонтального overflow.

Волна 11.14 закрыта: добавлен skip-link «К содержимому», shell-страницы получили `#main-content`, основной сайдбар и навигация базы знаний стали navigation landmarks, icon-only controls получили `aria-label`, чекбоксы — видимый `focus-visible`, а muted/subtle/disabled-текст поднят до AA-контраста.

Волна 12.1 закрыта: админские листинги компаний, пользователей, сотрудников и журнала переведены в компактные таблицы с сортировкой и фильтр-барами; список обращений поддержки уплотнён и получил сортировку. Админские разделы собраны в одну «Панель управления»: в сайдбаре остался один служебный пункт.

Волна 12.2 закрыта: `/admin/journals` и `/admin/moderation` больше не показывают технические cuid как основной текст. Журнал получает человекочитаемый `entity` summary от API, а ID остаётся мелкой audit-строкой; модерация показывает заголовки жалоб по автору и времени комментария, ID кейса/сущности вынесены в угол.

Волна 12.3 закрыта: enum-статусы и служебные коды больше не размазаны по UI локальными словарями. Общий web-helper `display-labels` даёт русские подписи для компаний, пользователей, ролей, подписок, поддержки, уведомлений, CMS, обучения, модерации, платежей, юридических документов, согласий, комментариев и файлов; `/admin/journals` локализует diff-поля, before/after и legacy payload.

Волна 12.4 закрыта: topbar breadcrumbs теперь показывают вложенный путь внутри единой админ-панели. CMS-страницы получают цепочку «Панель управления / CMS / раздел», операционные экраны — «Панель управления / Компании|Журнал|Поддержка|…»; текущий пункт помечен `aria-current="page"`, а длинные подписи не создают горизонтальный overflow в topbar.

Волна 12.5 закрыта: `/admin/content/news` показывает в строках новостей понятный статус, дату публикации или дату последнего обновления для черновика, заголовок, лид, теги и меню действий; кнопка «Предпросмотр» в редакторе открывает сохранённую публичную страницу новости как ссылку в новой вкладке.

Волна 12.6 закрыта: `BlocksEditor` уже работает через `@dnd-kit`; drag-handle «Перетащить» есть у каждого блока, а browser-check подтвердил реальное изменение порядка блоков в редакторе урока без сохранения в БД.

Волна 12.7 закрыта: редакторы новостей, уроков и базы знаний получили auto-save существующих черновиков каждые 30 секунд и при уходе фокуса из формы. Save-bar показывает состояния «Сохранено», «Сохраняется…» и «Не сохранено»; опубликованные записи остаются на ручном сохранении, чтобы не отправлять незавершённые правки на публичные страницы.

Волна 12.8 закрыта: публичные страницы `/news/<slug>?preview=1`, `/education/<moduleId>?preview=1` и `/education/<moduleId>/<lessonId>?preview=1` умеют показывать сохранённый preview для авторизованного автора, admin или content-manager. Preview новости отключает комментарии и реакции; preview урока отключает отметку прохождения и прогресс, а draft/in-development уроки не упираются в публичную блокировку.

Навигационный фундамент под `/admin`-дашборд 12.9 готов: `/admin` больше не редиректит в CMS, а показывает главную панель с группами быстрых переходов; локальная CMS-навигация убрана, а все дочерние страницы `/admin/*` ведут назад в центр через единую кнопку «← Панель управления».

Волна 12.9 закрыта: `/admin` теперь показывает сводный dashboard для администраторов: KPI-карточки, график регистраций за 30 дней, последние 5 событий audit-log и быстрые переходы по разделам. API-слой `GET /api/admin/dashboard` считает данные из реальных таблиц и доступен только роли `admin`; `content_manager` и `moderator` видят свои быстрые ссылки без чувствительных KPI.

Внеплановая навигационная правка закрыта: `/account` переведён из одной большой страницы с табами в современные настройки аккаунта с прямыми маршрутами `/account/profile`, `/account/security`, `/account/notifications`, `/account/data-privacy`, `/account/sessions`; на `/account/*` левое меню `AppShell` заменяется меню кабинета, а бизнес-разделы «Компания», «Подписка», «Поддержка» показываются только обычным пользователям компании.

Целевой следующий шаг: ручная приёмка MVP, затем только точечные bugfix-задачи по найденным проблемам.

## Что уже сделано

### Каркас и базовые модули (Волны 1–5, май 2026)

- Turborepo + pnpm monorepo: `apps/web`, `apps/api`, `packages/shared`.
- Next.js App Router: лента новостей, индексы цен, обучение, база знаний, кабинет, регистрация/вход, уведомления, юр-страницы.
- Админ-разделы CMS: новости, индексы, обучение, база знаний, поддержка, биллинг с ручной активацией, пользователи, сотрудники, компании, журналы действий, настройки платформы, модерация (жалобы, санкции, блоки).
- NestJS API: auth + JWT access + HttpOnly refresh-cookie, RBAC (платформенные роли), demo-доступ, ручная подписка, CMS (4 типа контента), индексы цен, поддержка, файлы-метаданные, in-app уведомления, модерация, юр-документы.
- Prisma + PostgreSQL: 25 миграций к 2026-05-26, актуальная схема в `apps/api/prisma/schema.prisma`.
- Перфоманс-индексы: 13 составных индексов на NewsPost/Comment/SupportTicket/Subscription/LearningModule и др.
- Пагинация envelope `{ items, total, hasMore }` на всех листингах публичной части и админки.
- 118 integration-тестов в `apps/api/src/app.integration.test.ts` + автоматический setup тестовой БД `ecoplatform_test`.
- Unit-тесты: 7 в `packages/shared`, 50 в `apps/web`, 76 в `apps/api`.
- GitHub Actions CI: `static-checks` (prettier-check + lint + test + build) и `integration` (Postgres 18 service); workflow-token ограничен read-only доступом к коду.
- Docker: multi-stage `Dockerfile` для api и web, `output: standalone` в Next.js, `binaryTargets` в Prisma под musl и debian.
- Локальный `docker-compose.yml`: PostgreSQL 18 на `:5433` + Redis 7 на `:6379`.
- Health-check через `@nestjs/terminus`: `/api/health` (liveness), `/api/ready` (Postgres/Redis/S3 readiness), `/api/health/deep` (admin-only диагностика).
- `Dockerfile` + deploy-решения по env, миграциям, SSL, бэкапам, CDN и первому запуску.

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
- Модель данных приведена к текущему состоянию всех доменов и принципов MVP.

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
- Lighthouse baseline: `/login` 93/96/96/100, `/news` 82/92/100/100, `/education` 86/92/100/100.

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
- Политика безопасности зафиксирована на уровне реализации: пароли, токены, CSP/CSRF/HSTS, lockout, 152-ФЗ, файлы, audit trail, операционный чек-лист и responsible disclosure.

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
- **Пункт 9.11 — политика безопасности**:
  - Зафиксированы правила паролей, токенов, CSP/CSRF/HSTS, lockout, 152-ФЗ, файлов, audit trail и операционного чек-листа.
  - Responsible disclosure фиксирует канал `security@eco-platform.ru`, состав отчёта, правила безопасного исследования, сроки реакции и порядок публикации.

## Что осталось

### Дальше

- **Волна 11** — UX/дизайн-система закрыта полностью: токены, типографика, цветовая семантика, состояния контролов, сайдбар, регистрация, demo-баннер, onboarding, индексы, фильтры новостей, микро-копирайтинг, публичные fallback-layouts и доступность.
- **Волна 12** — CMS-полишинг и админ-таблицы закрыта полностью: компактные админ-таблицы, скрытие cuid, локализация enum-значений, breadcrumbs, preview, drag-and-drop, auto-save, публичный preview и сводный `/admin` dashboard с KPI.
- **Ручная приёмка MVP** — владелец продукта отдельно проходит ключевые сценарии и фиксирует только реальные баги. Новые bugfix-задачи закрываются отдельно: один баг → один коммит.

### Тех-долг, осознанно отложенный

- 3.3 — расщепление `moderation.service.ts` (940 строк). Приватные хелперы тесно переплетены, расщепление создаст cross-service зависимости. Пересмотреть при росте >1500 строк.
- 5.2 — декомпозиция integration-тестов на доменные файлы (сейчас один файл на 118 тестов).
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

Перед seed задайте в локальном `.env` `SEED_ADMIN_PASSWORD` и
`SEED_DEMO_PASSWORD`; реальные пароли не хранятся в репозитории.

Учётки после сида:

- Админ: `admin@ecoplatform.local`, пароль из `SEED_ADMIN_PASSWORD`.
- Demo-пользователь: `demo@ecoplatform.local`, пароль из `SEED_DEMO_PASSWORD`.

Пользовательская админ-учётка для ручных проверок: `mojosay@icloud.com` (см. `.env.example::PLATFORM_OWNER_EMAIL`) — этого аккаунта нельзя ни деактивировать, ни снять с него роль admin через админ-UI.

## Проверки

```bash
pnpm lint                                             # tsc --noEmit во всех пакетах
pnpm test                                             # 133 unit-теста (shared 7, web 50, api 76)
pnpm build                                            # tsc + next build
pnpm test:integration                                 # 118 integration-тестов против ecoplatform_test
pnpm test:smoke                                       # Playwright smoke против PLAYWRIGHT_TEST_BASE_URL
pnpm format:check                                     # prettier
```

## Последняя зелёная проверка

Дата: 2026-05-27 (после реструктуризации личного кабинета).

- `pnpm --filter @ecoplatform/web typecheck` — успешно.
- `pnpm --filter @ecoplatform/web lint` — успешно.
- `pnpm --filter @ecoplatform/web test` — успешно: web 46/46.
- `pnpm --filter @ecoplatform/web build` — успешно.
- Browser UI-check — demo-пользователь: прямые `/account/security`, `/account/data-privacy`, `/account/sessions`, `/account/billing` показывают `aria-label="Навигация личного кабинета"`, активный пункт слева, breadcrumbs `Настройки аккаунта / раздел`, business-группу и `documentOverflowX=0`, `bodyOverflowX=0`; topbar account-menu открывается и подсвечивает активную «Безопасность». Mobile 390px `/account/security`: burger открывает account-меню слева, active «Безопасность», overflow = 0. Platform admin: `/account/billing` редиректит на `/account/profile`, бизнес-пункты скрыты, кнопки поддержки в topbar нет.
- Скриншоты: `/private/tmp/ecoplatform-account-settings-desktop.png`, `/private/tmp/ecoplatform-account-settings-mobile.png`, `/private/tmp/ecoplatform-account-settings-admin.png`.
- `pnpm exec prettier --check` по изменённым web/status-файлам — clean.
- `git diff --check` — clean.
- Последний полный root bundle до этой web-only правки: 2026-05-27 после Волны 12.4 (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:integration`, `pnpm build`, `pnpm format:check`, `git diff --check`).
- Lighthouse desktop baseline (commit `b8e3101`, без перезапуска в 12.4): `/login` 93/96/96/100, `/news` 82/92/100/100, `/education` 86/92/100/100.

## Целевая БД для деплоя

**Timeweb PostgreSQL 18.** Альтернативы (MySQL, MongoDB, ClickHouse) не подходят: Prisma datasource зафиксирован на `postgresql`, миграции и сидер написаны под PG. Redis вынесен на отдельный сервис.

Подробности по env-переменным, SSL, бэкапам, rollback-runbook, CDN и чек-листу первого деплоя вынесены из рабочей копии вместе с расширенной документацией; в репозитории оставлены ключевые решения и текущий статус.

## Важные решения, которые легко забыть

- Demo приравнен к basic-доступу только пока `demoEndsAt` в будущем.
- После истечения demo функциональные разделы API закрываются, но `/account`, `/billing/status`, `/support/tickets`, `/notifications` остаются.
- В статусе `pending_deletion` функциональные разделы тоже закрыты (через `access.ts`), доступ к `/account` сохраняется до фактического удаления через 30 дней.
- `/account/*` использует отдельное меню настроек аккаунта вместо глобального сайдбара; постоянные пункты личного кабинета и уведомлений не возвращать в основное меню платформы.
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
