# Прогресс исправлений

Трекер по результатам аудита от 2026-05-24. Помечайте `✅` когда задача закрыта; внутри отчётов `archive/2026-05-24/0X-*.md` к каждому пункту добавляйте такой же маркер с короткой ссылкой на коммит/файлы.

## Текущая точка

- **Текущая волна:** 9 — Безопасность и 152-ФЗ, 9/11 закрыто.
- **Открытые задачи:** 9.7 (audit-trail before/after), 9.11 (документ политики безопасности).
- **Следующая волна:** 10 — Наблюдаемость и операции (pino, Sentry, Prometheus, distributed cron, прод smoke-test).
- **Закрытые волны:** 1–8 целиком (волны 3 и 5 — с осознанно отложенными подпунктами 3.3, 5.2, 5.3, 5.4).
- **Последнее обновление журнала:** 2026-05-26.

## Легенда статусов

- `⬜` — не начато
- `🟦` — в работе
- `✅` — сделано (тесты зелёные, изменения в main)
- `🟥` — заблокировано (нужно решение)

---

## Волна 1 — критичное в проде (P0)

| # | Задача | Файл аудита | Статус |
| --- | --- | --- | --- |
| 1.1 | JWT-секрет: бросать ошибку при старте, убрать фолбэк | [01-security.md#1](archive/2026-05-24/01-security.md) | ✅ |
| 1.2 | Убрать `passwordHash` из `admin/billing/companies` (заменить include→select) | [01-security.md#leak-passwordHash](archive/2026-05-24/01-security.md), [02-stability.md#1](archive/2026-05-24/02-stability.md) | ✅ |
| 1.3 | Access-токен — в памяти, не в localStorage | [01-security.md#3](archive/2026-05-24/01-security.md) | ✅ (уточнено 2026-05-25): `AuthProvider` теперь реально вызывает `tryRestoreSession()` на mount и восстанавливает access-token через HttpOnly refresh-cookie после reload; stale-комментарии про `localStorage` убраны. |
| 1.4 | `@nestjs/throttler` + rate-limit на `/auth/*` | [01-security.md#2](archive/2026-05-24/01-security.md) | ✅ |
| 1.5 | MIME-валидация file upload (file-type + блок HTML/SVG) | [01-security.md#4](archive/2026-05-24/01-security.md) | ✅ (закрыто 2026-05-25): `apps/api/src/files/files.service.ts` определяет реальный MIME через `file-type/fromBuffer`, блокирует HTML/SVG/executable-типы и опасные расширения, сравнивает declared MIME с detected MIME, а не-media файлы кладёт в S3 с `Content-Disposition: attachment`. `apps/api/src/files/files.service.test.ts` покрывает HTML-as-image, SVG и PDF attachment. |
| 1.6 | `app.enableShutdownHooks()` + `app.set('trust proxy', 1)` + CORS maxAge | [02-stability.md#2](archive/2026-05-24/02-stability.md), [01-security.md#7](archive/2026-05-24/01-security.md), [04-performance.md#4](archive/2026-05-24/04-performance.md) | ✅ |
| 1.7 | Транзакция вокруг создания LearningModule + retry на P2002 | [02-stability.md#3](archive/2026-05-24/02-stability.md) | ✅ |
| 1.8 | PostCSS — pnpm override `>=8.5.10` (закрывает GHSA-qx2v-qp2m-jg93) | [01-security.md#5](archive/2026-05-24/01-security.md) | ✅ |
| 1.9 | `/forgot-password` — заглушка с инструкцией написать поддержке | [03-bugs.md#1](archive/2026-05-24/03-bugs.md) | ✅ |
| 1.10 | `app/not-found.tsx` с локализованным русским 404 и навигацией | [03-bugs.md#2](archive/2026-05-24/03-bugs.md) | ✅ |
| 1.11 | `app/error.tsx` — фоллбек для рантайм-ошибок | [03-bugs.md#2](archive/2026-05-24/03-bugs.md) | ✅ |
| 1.12 | Реальные сообщения ошибок в LoginForm/RegisterForm + парсинг NestJS-envelope | [03-bugs.md#3](archive/2026-05-24/03-bugs.md) | ✅ |

## Волна 2 — фундамент для деплоя

| # | Задача | Файл аудита | Статус |
| --- | --- | --- | --- |
| 2.1 | `Dockerfile` для api (multi-stage, tini, non-root) | [06-deploy.md#1](archive/2026-05-24/06-deploy.md) | ✅ |
| 2.2 | `Dockerfile` для web + `output: standalone` в next.config.ts | [06-deploy.md#1, 19](archive/2026-05-24/06-deploy.md) | ✅ |
| 2.3 | `binaryTargets` в schema.prisma (native + linux-musl + debian) | [06-deploy.md#4](archive/2026-05-24/06-deploy.md) | ✅ |
| 2.4 | Health-check `/api/health` + `/api/ready` через @nestjs/terminus | [02-stability.md#8](archive/2026-05-24/02-stability.md) | ✅ |
| 2.5 | SSL в DATABASE_URL — описано в `docs/08-architecture/deploy.md` | [06-deploy.md#2](archive/2026-05-24/06-deploy.md) | ✅ |
| 2.6 | `.env.example` — порт 5433 + комментарии про SSL/секреты | [00-baseline.md#1](archive/2026-05-24/00-baseline.md), [06-deploy.md#7](archive/2026-05-24/06-deploy.md) | ✅ |
| 2.7 | `docs/08-architecture/deploy.md`: env, миграции, бэкапы, health, CORS, чек-лист | [06-deploy.md#9, 10](archive/2026-05-24/06-deploy.md) | ✅ |

## Волна 3 — большой рефакторинг (≥3 итерации)

| # | Задача | Файл аудита | Статус |
| --- | --- | --- | --- |
| 3.1 | Разнести `DataViews.tsx` (3244 → 10 строк): 7 view-файлов + _shared + content-blocks | [05-architecture.md#1](archive/2026-05-24/05-architecture.md) | ✅ (доведено 2026-05-25): все 9 страниц `app/*` переключены на `views/*-view.tsx`, `AdminNewsView` тоже переключён на `views/content-blocks`, `DataViews.tsx` (2567 строк) удалён. Re-export hack `KnowledgeBaseView`/`KnowledgeArticleView` из account-view убран. |
| 3.2 | Разнести `content.service.ts` (2120 → 0) на 5 сервисов в `services/`: ContentCommon, News, Indices, Learning, KnowledgeBase | [05-architecture.md#2](archive/2026-05-24/05-architecture.md) | ✅ (доведено 2026-05-25): `ContentController` теперь инжектит 4 доменных сервиса (NewsService, IndicesService, LearningService, KnowledgeBaseService); `ContentCommonService` подключён как provider в module и инжектится внутри доменных. Старый `content.service.ts` (2013 строк) удалён. Добавлен `GET /admin/content/news/:id` для редактора. Pagination через @Query в `/news` и `/admin/content/news`. |
| 3.3 | Разнести `moderation.service.ts` (940 строк) | [05-architecture.md#3](archive/2026-05-24/05-architecture.md) | 🟦 Отложено: приватные хелперы (subjectForEntity, notifyDecision, enrichCases) тесно переплетены между сases/sanctions. Расщепление создаст cross-service зависимости и кеш-локальность ухудшится. Решение: оставить как cohesive moderation-домен; при росте >1500 строк — пересмотреть. |
| 3.4 | DTO-типы (NewsListItem, Comment, KnowledgeNode, LearningModuleDetail, BillingStatus…) в `packages/shared/src/api-response.ts`. Все 56 `any` в `apps/web/src/views/*.tsx` заменены на типизированные | [05-architecture.md#4](archive/2026-05-24/05-architecture.md) | ✅ |
| 3.5 | Единый `sanitize-html.ts` в packages/shared (с afterSanitizeAttributes-hook для `rel`) | [05-architecture.md#5](archive/2026-05-24/05-architecture.md) | ✅ |
| 3.6 | Типизированный `apps/web/src/lib/api/` (core.ts + endpoints.ts + index.ts) с namespaced `api.news.list()` / `api.indices.list()` / etc. + новый `useApiQuery(key, fetcher, initial)`. Все views переведены на api.* | [05-architecture.md#7](archive/2026-05-24/05-architecture.md) | ✅ |

## Волна 4 — производительность

| # | Задача | Файл аудита | Статус |
| --- | --- | --- | --- |
| 4.1 | Пагинация envelope `PaginatedResponse<T>` (limit/offset) на: `/news`, `/admin/content/news` (без blocks, + новый GET `/admin/content/news/:id` для редактора), `/support/tickets` + `/admin/support/tickets`, `/admin/billing/companies`. Notifications уже имеют `take: 100` cap | [04-performance.md#1](archive/2026-05-24/04-performance.md) | ✅ (доведено 2026-05-25 вместе с 3.2): после переключения controller на split-сервисы `/news?limit=N&offset=N` возвращает `{items, total, hasMore}`, добавлен `GET /admin/content/news/:id`. Integration-тесты на `/news` envelope обновлены (5 мест) и на `/support/tickets` (2 места). Runtime-smoke: `curl /api/news?limit=3` → 200 с envelope. |
| 4.2 | Индексы БД: миграция `20260525051938_perf_indexes` — 13 индексов на NewsPost/Comment/SupportTicket/LearningModule/KnowledgeBaseArticle/PriceIndex/Subscription/SupportTicketMessage | [04-performance.md#2](archive/2026-05-24/04-performance.md) | ✅ |
| 4.3 | CORS `maxAge: 86400` (закрыто в Волне 1) | [04-performance.md#4](archive/2026-05-24/04-performance.md) | ✅ |
| 4.4 | Публичные view (news/learning/knowledge-base) + AppShell + аватары переведены на `next/image` (10 теги, через `/_next/image` с automatic resize+srcset). Админ-CMS (AdminNewsView/FileUploadField) оставлен на `<img>` — там превью с произвольным ratio | [04-performance.md#6](archive/2026-05-24/04-performance.md) | ✅ |
| 4.5 | `loading.tsx` skeleton на 5 ключевых маршрутах (news, indices, education, knowledge-base, account) + общий `PageSkeleton` компонент | [04-performance.md#7](archive/2026-05-24/04-performance.md) | ✅ |
| 4.6 | Батч `replaceNewsTags`: было 2×N запросов (upsert+create на каждый тег), стало 3 фиксированных запроса (createMany skipDuplicates + findMany + createMany skipDuplicates) | [04-performance.md#8](archive/2026-05-24/04-performance.md) | ✅ |
| 4.7 | `FileReference` (полиморфная таблица fileId → entityType/entityId) + миграция `20260525064424_file_reference`, хуки в news/learning/knowledge create/update/delete, backfill при первом старте, переписанный `deleteIfUnreferenced` (count вместо scan). FK-фильтр против orphan-fileId | [04-performance.md#9](archive/2026-05-24/04-performance.md) | ✅ |

## Волна 5 — порядок и развитие

| # | Задача | Файл аудита | Статус |
| --- | --- | --- | --- |
| 5.1 | GitHub Actions `ci.yml`: 2 job'а — static-checks (prettier/lint/test/build) + integration (Postgres 18 service) + `format:check` скрипт + `.prettierrc` + `.prettierignore` + auto-format 36 файлов | [05-architecture.md#15, 16](archive/2026-05-24/05-architecture.md) | ✅ |
| 5.2 | Декомпозиция integration-тестов на доменные файлы | [05-architecture.md#8](archive/2026-05-24/05-architecture.md) | ⬜ Отложено |
| 5.3 | OpenAPI/Swagger | [05-architecture.md#9](archive/2026-05-24/05-architecture.md) | ⬜ Отложено |
| 5.4 | Структурное логирование pino + LOG_LEVEL | [06-deploy.md#8](archive/2026-05-24/06-deploy.md) | ⬜ Отложено |
| 5.5 | DOMPurify-hook: rel="noopener noreferrer" — закрыто ещё в Волне 3 при объединении sanitize-html | [01-security.md#8](archive/2026-05-24/01-security.md) | ✅ |
| 5.6 | `findManyByIds` теперь фильтрует по `accessLevel: public` — приватные файлы не утекают через `/files?ids=...` | [01-security.md#9](archive/2026-05-24/01-security.md) | ✅ (закрыто 2026-05-25): `apps/api/src/files/files.service.ts` добавляет `accessLevel: FileAccessLevel.public` в `findManyByIds`; `apps/api/src/files/files.service.test.ts` проверяет Prisma-where и дедуп ids. |
| 5.7 | `MIN_PASSWORD_LENGTH = 10` + `passwordSchema` в `packages/shared/src/dto.ts`. Применено в register, change-password, admin-staff. Тесты обновлены (User12345 → User123456) | [01-security.md#10](archive/2026-05-24/01-security.md) | ✅ |
| 5.8 | Хелпер `swallowAndLog(context, payload)` в `common/silent-catch.ts` + 13 заменённых `.catch(() => undefined)` в auth/support/billing/billing-notifications/moderation | [02-stability.md#4](archive/2026-05-24/02-stability.md) | ✅ |
| 5.9 | `GlobalExceptionFilter` (5xx → error + stack, 4xx → warn) + `registerProcessErrorHandlers()` (unhandledRejection/uncaughtException). Подключено в `main.ts` | [02-stability.md#5](archive/2026-05-24/02-stability.md) | ✅ |
| 5.10 | Idempotency-key на manual subscription | [02-stability.md#6](archive/2026-05-24/02-stability.md) | ✅ (закрыто 2026-05-25): добавлена таблица `IdempotencyKey` + миграция `20260525191500_idempotency_keys`; `POST /api/admin/billing/manual-subscriptions` требует `Idempotency-Key`, повтор с тем же payload возвращает тот же результат без дублей подписок, `AdminActionLog` и уведомлений, а повтор с другим payload даёт 409. |
| 5.11 | News-карточки: `<button onClick>` → `<a href onClick.preventDefault>` (SEO + middle-click + Ctrl-клик) | [03-bugs.md#6](archive/2026-05-24/03-bugs.md) | ✅ |
| 5.12 | Hint про политику пароля в `AuthField` + CSS `.auth-field-hint`. Регистрация показывает «Не короче 10 символов, минимум одна буква и одна цифра» | [03-bugs.md#11](archive/2026-05-24/03-bugs.md) | ✅ |

## Волна 6 — Юридический фундамент и согласия

| #   | Задача                                                                                       | Файл плана                                       | Статус |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------ |
| 6.1 | Миграция Prisma: enum `LegalDocumentType`/`ConsentSource` + модели `LegalDocument`/`ConsentRecord` + relation в `User` | [EXECUTION-PLAN.md#6.1](ROADMAP.md)       | ✅      |
| 6.2 | API: публичные `GET /legal/documents`, `GET /legal/documents/:type/:version`, `POST /legal/consents`, `GET /legal/me/consents`; админские `GET/POST /admin/legal/documents`, `POST /admin/legal/documents/:id/publish` | [EXECUTION-PLAN.md#6.2](ROADMAP.md)       | ✅      |
| 6.3 | 5 публичных web-страниц `/legal/{privacy,terms,personal-data,cookies,offer}` + `LegalDocumentPage` + публичный layout без AppShell | [EXECUTION-PLAN.md#6.3](ROADMAP.md)       | ✅      |
| 6.4 | `CookieConsent` компонент: 3 кнопки (принять все / только необходимые / настроить), категории, флаг `window.__ANALYTICS_ENABLED__`, `localStorage.eco_cookie_consent_v1` | [EXECUTION-PLAN.md#6.4](ROADMAP.md)       | ✅      |
| 6.5 | Регистрация: `RegisterDto.acceptedDocumentIds`, валидация обязательных в `auth.service.register`, `ConsentRecord` × N с source=registration + IP/UA; UI `RegisterForm` подгружает активные документы и рендерит чекбоксы (3 обязательных + опциональные) | [EXECUTION-PLAN.md#6.5](ROADMAP.md)       | ✅      |
| 6.6 | Re-consent: `auth/me.requiresReConsent` вычисляется динамически через `count` обязательных активных vs пользовательских ConsentRecord | [EXECUTION-PLAN.md#6.6](ROADMAP.md)       | ✅      |
| 6.7 | Footer с юр-ссылками: в `AppShell` (3 колонки), в `AuthShell` (5 ссылок строкой), в `/legal/*` layout | [EXECUTION-PLAN.md#6.7](ROADMAP.md)       | ✅      |
| 6.8 | Seed: 5 placeholder-документов с `version 1.0.0` (privacy/terms/personal-data — required; cookies/offer — optional, все active) | [EXECUTION-PLAN.md#6.8](ROADMAP.md)       | ✅      |

---

## Волна 7 — Архитектурный фундамент данных

| #   | Задача                                                                                                       | Файл плана                                 | Статус |
| --- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ------ |
| 7.1 | Polymorphic Discussion + Comment: новая модель Discussion(targetType, targetId), Comment.newsPostId → discussionId, ленивое создание Discussion при первом комментарии, миграция данных существующих комментариев | [EXECUTION-PLAN.md#7.1](ROADMAP.md) | ✅      |
| 7.2 | Address как первоклассная сущность: модель Address (страна/регион/город/улица/координаты/formatted), Company.factualAddressId + structuredLegalAddressId, миграция старого текстового legalAddress → Address(source=legacy) | [EXECUTION-PLAN.md#7.2](ROADMAP.md) | ✅      |
| 7.3 | Расширение Company: websiteUrl, corporatePhone/Email, about, logoFileId, contactPerson*. PATCH /api/billing/company с CompanyProfileUpdateDto и AddressDto. BillingStatus в shared расширен новыми полями + CompanyAddress | [EXECUTION-PLAN.md#7.3](ROADMAP.md) | ✅      |
| 7.4 | UI «Реквизиты компании» в /account → таб «Компания»: редактируемая форма из 4 секций (Основное / Контакты / Фактический адрес / Юридический адрес / Банковские реквизиты), один Save-кнопка внизу, успешный PATCH обновляет локальный billing state | [EXECUTION-PLAN.md#7.4](ROADMAP.md) | ✅      |
| 7.5 | Расширение enums «на вырост»: `NotificationCategory` +5 (forum, solutions_shop, reviews, geo_alert, price_alert), `NotificationChannel` +2 (telegram, push), `SupportTicketCategory` +4 (marketplace_dispute, forum_complaint, shop_purchase, refund_request), новые enum `PaymentMethodType` и `PaymentStatus` | [EXECUTION-PLAN.md#7.5](ROADMAP.md) | ✅      |
| 7.6 | PaymentMethod + Payment модели: таблицы под Тинькофф-Кассу (cardMask, providerToken, providerOrderId @unique, amount/currency/status/purpose). UI-заглушка в /account → Подписка: «Способы оплаты» (две disabled-кнопки) + «История платежей» (empty-state) | [EXECUTION-PLAN.md#7.6](ROADMAP.md) | ✅      |
| 7.7 | ContentBlock версионирование: в payload каждого блока (NewsContentBlock/LessonContentBlock/KnowledgeBaseBlock) теперь ключ `v: 1`. SQL-backfill в существующие строки + сервис ContentCommonService.payload() добавляет `v: 1` при insert/update. Новый тип `ContentBlockV1<TPayload>` в shared | [EXECUTION-PLAN.md#7.7](ROADMAP.md) | ✅      |
| 7.8 | ApiKey модель: companyId, name, keyHash (bcrypt), scopes[], isActive, lastUsedAt, expiresAt, createdBy. UI и эндпоинты — после MVP, фундамент стоит | [EXECUTION-PLAN.md#7.8](ROADMAP.md) | ✅      |
| 7.9 | docs/08-architecture/data-model.md: status draft → current, описание всех доменов (auth/subscriptions, контент, файлы, уведомления, модерация, поддержка, юр-документы, платформа), полиморфных связей и таблицы миграций Волн 4–7 | [EXECUTION-PLAN.md#7.9](ROADMAP.md) | ✅      |

---

## Волна 8 — Высоконагрузочная инфраструктура

| #    | Задача                                                                                                                 | Файл плана                                 | Статус |
| ---- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------ |
| 8.1  | Redis для сессий и rate-limit: `RedisModule`, cache `JwtAuthGuard` на 60 сек, инвалидация при logout/revoke/changePassword/blockUser/company status/staff role changes, Redis-backed throttler с in-memory fallback, `redis:7-alpine` в docker-compose | [EXECUTION-PLAN.md#8.1](ROADMAP.md) | ✅      |
| 8.2  | Infinite scroll для публичных и админских листингов: общий `useInfiniteApiQuery`, `/news`, уведомления, support drawer, admin news/support/billing/users/companies/staff/journals | [EXECUTION-PLAN.md#8.2](ROADMAP.md) | ✅      |
| 8.3  | Prisma connection pooling и production best practices: `PrismaService` добавляет `connection_limit=20` при отсутствии в `DATABASE_URL`, запускает `PrismaClient` с `errorFormat: "minimal"` и логами `warn/error`; `.env.example` и deploy-доки фиксируют лимит пула и расчёт соединений на N реплик | [EXECUTION-PLAN.md#8.3](ROADMAP.md) | ✅      |
| 8.4  | Полная пагинация API-листингов через `PaginatedResponse<T>`                                                            | [EXECUTION-PLAN.md#8.4](ROADMAP.md) | ✅      |
| 8.5  | CDN/cache headers для статики: `next.config.ts` отдаёт `/brand/*` и `/avatars/*` с `Cache-Control: public, max-age=31536000, immutable`; deploy-док фиксирует CDN перед web, правила кеширования и purge/versioning для public-ассетов | [EXECUTION-PLAN.md#8.5](ROADMAP.md) | ✅      |
| 8.6  | gzip/brotli compression: API подключает Express `compression()` middleware; deploy-дока фиксирует gzip/Brotli-проверки для API и web/CDN | [EXECUTION-PLAN.md#8.6](ROADMAP.md) | ✅      |
| 8.7  | Distributed cron через Postgres advisory lock: `billing-hourly-check` берёт transaction-level `pg_try_advisory_xact_lock(hashtext('cron:billing-hourly-check'))` перед запуском, а при занятом lock пропускает tick на текущей API-реплике | [EXECUTION-PLAN.md#8.7](ROADMAP.md) | ✅      |
| 8.8  | `/api/news/tags` и фильтрация `/api/news?tags[]=...`: публичный топ тегов по `usageCount` с `limit`, AND-фильтр ленты по `tags[]` | [EXECUTION-PLAN.md#8.8](ROADMAP.md) | ✅      |
| 8.9  | WebP/AVIF варианты для cover-изображений: `imagePreset=cover` генерирует WebP primary + AVIF sidecar, сохраняет metadata в `FileAsset.variants`, web выбирает preferred variant URL | [EXECUTION-PLAN.md#8.9](ROADMAP.md) | ✅      |
| 8.10 | Lighthouse baseline и регрессия                                                                                        | [EXECUTION-PLAN.md#8.10](ROADMAP.md) | ✅      |

---

## Волна 9 — Безопасность и 152-ФЗ

| #    | Задача                                                                                                           | Файл плана                                 | Статус |
| ---- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------ |
| 9.1  | HTTP security headers: Helmet на API без CSP/COEP; глобальные web headers в `next.config.ts`, CSP только report-only | [EXECUTION-PLAN.md#9.1](ROADMAP.md) | ✅      |
| 9.2  | CSRF на mutating endpoints через double-submit cookie: `csrf-token` cookie + `X-CSRF-Token`, `GET /auth/csrf`, guard на `/auth/refresh` и всех `POST/PATCH/DELETE` кроме login/register | [EXECUTION-PLAN.md#9.2](ROADMAP.md) | ✅      |
| 9.3  | Email-enumeration timing fix: `AuthService.login()` всегда выполняет bcrypt `compare()` — для неизвестного email против dummy hash, для существующего пользователя против реального hash | [EXECUTION-PLAN.md#9.3](ROADMAP.md) | ✅      |
| 9.4  | Lockout после серии неудачных логинов: 10 ошибок за 15 минут → `lockedUntil` на 15 минут, успешный вход после истечения сбрасывает счётчик | [EXECUTION-PLAN.md#9.4](ROADMAP.md) | ✅      |
| 9.5  | 152-ФЗ: экспорт «моих данных»: `POST /api/auth/me/export-data` формирует синхронный ZIP с JSON-файлами профиля, компании, согласий, сессий, уведомлений, обращений, прогресса, комментариев, реакций, модерации, FileAsset metadata, authored-content и audit-log; web `/account → Безопасность` получил кнопку скачивания архива | [EXECUTION-PLAN.md#9.5](ROADMAP.md) | ✅      |
| 9.6  | 152-ФЗ: запрос удаления аккаунта                                                                                 | [EXECUTION-PLAN.md#9.6](ROADMAP.md) | ✅      |
| 9.7  | Audit-trail с before/after                                                                                       | [EXECUTION-PLAN.md#9.7](ROADMAP.md) | ⬜      |
| 9.8  | Лимиты файлового аплоадера                                                                                       | [EXECUTION-PLAN.md#9.8](ROADMAP.md) | ✅      |
| 9.9  | Защита cover-image от чужих файлов                                                                               | [EXECUTION-PLAN.md#9.9](ROADMAP.md) | ✅      |
| 9.10 | Password policy: длина 12 + проверка по haveibeenpwned-pwned-passwords API                                      | [EXECUTION-PLAN.md#9.10](ROADMAP.md) | ✅      |
| 9.11 | Документирование политики безопасности                                                                           | [EXECUTION-PLAN.md#9.11](ROADMAP.md) | ⬜      |

---

---

## Журнал работы

> Записи по волнам 1–8 свёрнуты в одну строку на волну. Детальные записи по каждой задаче — в [archive/2026-05-24/journal-waves-1-8.md](archive/2026-05-24/journal-waves-1-8.md).

| Дата | Что закрыто | Кто |
| --- | --- | --- |
| 2026-05-24 | **Волна 1 закрыта (12/12 P0)**: JWT-секрет, passwordHash leak, access-token в памяти, throttler, MIME-валидация, graceful shutdown, race-fix модуля, postcss override, /forgot-password, not-found.tsx, error.tsx, реальные сообщения ошибок логина. Детали — в `archive/2026-05-24/journal-waves-1-8.md`. | Claude |
| 2026-05-24 | **Волна 2 закрыта (7/7)**: Dockerfile API + web, Next.js `output: standalone`, binaryTargets Prisma, health/ready через @nestjs/terminus, .env.example, docs/08-architecture/deploy.md. | Claude |
| 2026-05-25 | **Волна 3 закрыта (5/6)**: split `DataViews.tsx` 3244→0 на 7 view-файлов, split `content.service.ts` 2120→0 на 5 сервисов, DTO-типы в shared (56 `any` убраны), общий `sanitize-html`, типизированный API-клиент. Отложено: 3.3 moderation split. | Claude |
| 2026-05-25 | **Волна 4 закрыта (7/7)**: 13 индексов БД, CORS-кеш, фикс N+1 в `replaceNewsTags`, пагинация envelope на 5 листингов, `loading.tsx` skeleton, `next/image` для публичных view, таблица `FileReference` + cleanup из O(M) в O(1). | Claude |
| 2026-05-25 | **Волна 5 закрыта (8/12)**: GitHub Actions CI + prettier, `findManyByIds` фильтр по public, общая `passwordSchema` (длина 10), `swallowAndLog` (13 silent-catch), `GlobalExceptionFilter`, news-карточки `<a href>`, hint про пароль, idempotency-key для ручной активации. Отложено: 5.2 (split integration-tests), 5.3 (OpenAPI), 5.4 (pino). | Claude+Codex |
| 2026-05-26 | **Волна 6 закрыта (8/8)** — юридический фундамент: миграция `LegalDocument`/`ConsentRecord`, API публичный+админский, 5 публичных страниц `/legal/*`, `CookieConsent` баннер, consent-чекбоксы в регистрации, re-consent через `auth/me`, footer с юр-ссылками, seed 5 placeholder-документов. | Claude |
| 2026-05-26 | **Волна 7 закрыта (9/9)** — архитектурный фундамент данных: polymorphic Discussion+Comment, Address как сущность, расширение Company (8 полей + UI «Реквизиты»), enums «на вырост» (notifications/support/payments), модели PaymentMethod+Payment с UI-заглушкой, версионирование ContentBlock (`v: 1`), модель ApiKey, обновлённый `docs/08-architecture/data-model.md`. | Claude |
| 2026-05-26 | **Волна 8 закрыта (10/10)** — высоконагрузочная инфраструктура: Redis для сессий и rate-limit, infinite scroll везде, Prisma connection pool, пагинация всех листингов, CDN cache headers, gzip/brotli compression, distributed cron через advisory lock, `/news/tags` + AND-фильтр, WebP/AVIF варианты обложек, Lighthouse baseline зафиксирован. | Codex |
| 2026-05-26 | Волна 9, задача 9.1 (HTTP security headers) закрыта. **API:** добавлен `helmet@8.2.0`, middleware подключён в `apps/api/src/main.ts` перед compression; `contentSecurityPolicy: false`, `crossOriginEmbedderPolicy: false`, чтобы CSP осталась на web-стороне, а COEP не мешал iframe-видео Rutube. **Web:** `apps/web/next.config.ts` получил глобальные headers `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `Content-Security-Policy-Report-Only`; существующие immutable cache headers для `/brand/*` и `/avatars/*` сохранены. Решение сверено с актуальными docs Helmet и Next.js через Context7; CSP не переводилась в enforced mode. **Curl-smoke:** `curl -I http://localhost:3000/login` показал весь web security-набор и report-only CSP; `curl -I http://localhost:3000/brand/logo.webp` подтвердил security headers + `Cache-Control: public, max-age=31536000, immutable`; `curl -I http://localhost:4000/api/health` подтвердил Helmet headers на API без `Content-Security-Policy` и без `Cross-Origin-Embedder-Policy`. Проверки: `pnpm lint` зелёный (4/4), `pnpm test` зелёный (shared 7/7 + web 7/7 + api 35/35), `pnpm test:integration` зелёный (API integration **103/103**), `pnpm build` зелёный (3/3), `pnpm format:check` clean. | Codex |
| 2026-05-26 | Волна 9, задача 9.2 (CSRF на mutating endpoints) закрыта. **API:** добавлен `CsrfGuard` и `csrfCookieMiddleware`: API выдаёт `csrf-token` cookie (`SameSite=Strict`, не HttpOnly, `Path=/`), `GET /api/auth/csrf` возвращает текущий токен, а все unsafe-методы требуют совпадения cookie и `X-CSRF-Token`; исключены только `POST /auth/login` и `POST /auth/register`, `POST /auth/refresh` теперь защищён. CORS явно пропускает `X-CSRF-Token` вместе с `Authorization` и `Idempotency-Key`. **Web:** `apiFetch`, auto-refresh, file upload/delete и все typed endpoints через общий слой автоматически добавляют CSRF-заголовок; при холодном reload перед `/auth/refresh` клиент получает токен через `/auth/csrf`, поэтому восстановление refresh-cookie не ломается. **Тесты/доки:** integration-тесты проверяют выдачу cookie, 403 без header и успешный `/auth/refresh` с matching cookie/header; тестовый HTTP-клиент добавляет CSRF только в обычных сценариях, а `rawHttp` оставлен для негативных security-кейсов. `docs/08-architecture/deploy.md` дополнил CORS/cookie и smoke-check. Проверки: `pnpm lint` зелёный (4/4), `pnpm test` зелёный (shared 7/7 + web 7/7 + api 35/35), `pnpm test:integration` зелёный (API integration **105/105**), `pnpm build` зелёный (3/3), `pnpm format:check` clean. | Codex |
| 2026-05-26 | Волна 9, задача 9.3 (Email-enumeration timing fix) закрыта. **API:** `AuthService.login()` больше не возвращает быстрый путь для неизвестного email: после `findUnique` всегда выполняется `bcryptjs.compare`, используя реальный `passwordHash` найденного пользователя или фиксированный dummy bcrypt hash. Ошибка для неизвестного email и неверного пароля осталась одинаковой: «Неверный email или пароль.». **Тесты:** добавлен `apps/api/src/auth/auth.service.test.ts`, который проверяет нормализацию email и обязательный вызов `compare()` с dummy hash при отсутствующем пользователе. Проверки: targeted `pnpm --filter @ecoplatform/api test -- auth.service.test.ts` зелёный (API unit **36/36**); полный набор зелёный: `pnpm lint` (4/4), `pnpm test` (shared 7/7 + web 7/7 + api 36/36), `pnpm test:integration` (API integration **105/105**), `pnpm build` (3/3), `pnpm format:check` clean. | Codex |
| 2026-05-26 | Волна 9, задача 9.4 (Lockout после серии неудачных логинов) закрыта. **API/DB:** добавлена миграция `20260526143000_login_lockout`: `User.failedLoginAttempts`, `failedLoginWindowStartedAt`, `lockedUntil` + индекс по `lockedUntil`. `AuthService.login()` после bcrypt-compare считает неудачные попытки в 15-минутном окне: 10-я ошибка ставит lockout на 15 минут, активный lockout блокирует даже правильный пароль, успешный вход после истечения сбрасывает счётчик и lockout-поля. Для неизвестного email по-прежнему выполняется dummy bcrypt compare и состояние не пишется. **Тесты:** unit покрывает dummy compare, increment, 10-ю ошибку и активный lockout; integration покрывает полный HTTP-флоу 10 ошибок → блокировка → истечение → успешный вход и сброс полей. Проверки: `pnpm --filter @ecoplatform/api prisma:generate`, `pnpm lint` зелёный (4/4), `pnpm test` зелёный (shared 7/7 + web 7/7 + api 39/39), `pnpm test:integration` зелёный (API integration **106/106**, миграция применена), `pnpm build` зелёный (3/3), `pnpm format:check` clean. | Codex |
| 2026-05-26 | Волна 9, задача 9.5 (152-ФЗ: экспорт «моих данных») закрыта. **API:** добавлен `AuthDataExportService` и `POST /api/auth/me/export-data`, который по JWT и CSRF формирует синхронный ZIP без новой зависимости: `manifest.json`, `profile.json`, `company.json`, `consents.json`, `sessions.json`, `notifications.json`, `support-tickets.json`, `learning-progress.json`, `comments.json`, `reactions.json`, `moderation.json`, `files.json`, `authored-content.json`, `audit-log.json`; ответ отдаётся с `Cache-Control: no-store`. Экспорт сознательно не включает `passwordHash`, `refreshTokenHash`, `providerToken`, `keyHash`; после скачивания создаётся security-уведомление `auth.data_export.ready`. **Web:** общий `apiDownload()` поддерживает binary/blob responses с auth-refresh и CSRF, `api.auth.exportData()` подключён в `/account → Безопасность`, добавлена карточка «Мои данные» с кнопкой скачивания. **Тесты:** integration проверяет ZIP-сигнатуру, `no-store`, наличие основных JSON-файлов и данных пользователя/компании/тикета/FileAsset, отсутствие секретных хэшей и создание security-уведомления. Проверки: `pnpm lint` зелёный (4/4), `pnpm test` зелёный (shared 7/7 + web 7/7 + api 39/39), `pnpm test:integration` зелёный (API integration **107/107**; первый ошибочный локальный запуск без фильтра ловил известный transient 407, повторный полный прогон зелёный), `pnpm build` зелёный (3/3), `pnpm format:check` clean. | Codex |
| 2026-05-26 | Волна 9, задачи 9.8–9.9 (лимиты файлового аплоадера и защита cover-image) закрыты одним компактным security-коммитом. **API:** `POST /api/files/upload` получил endpoint-level throttle 20 запросов/минуту; `FilesService.upload()` перед MIME/S3 обработкой проверяет дневную квоту 500 МБ за последние 24 часа по всем пользователям компании, а для platform-staff без компании — по самому пользователю, и возвращает 429 с понятным временем сброса. **CMS security:** добавлен `FilesService.assertCoverImageAllowed()` + общий `ContentCommonService.assertCoverImageAllowed()`: news/learning/knowledge create/update принимают только существующее публичное изображение; content-manager может использовать только свой upload, admin может использовать публичные изображения других авторов для CMS-работы. **Тесты:** `files.service.test.ts` покрывает quota-before-S3, запрет чужой обложки и admin-override; integration добавляет HTTP-кейс `content manager не может поставить чужой файл как coverImageId` и обновляет существующий PATCH learning под реальный `FileAsset`. Проверки: targeted `pnpm --filter @ecoplatform/api test -- files.service.test.ts` зелёный (API unit **42/42**), targeted `pnpm --filter @ecoplatform/api test:integration` зелёный (API integration **108/108**), полный набор зелёный: `pnpm lint` (4/4), `pnpm test` (shared 7/7 + web 7/7 + api 42/42), `pnpm test:integration` (API integration **108/108**), `pnpm build` (3/3), `pnpm format:check` clean. | Codex |
| 2026-05-26 | Волна 9, задача 9.6 (152-ФЗ: запрос удаления аккаунта) закрыта. **API/DB:** добавлена миграция `20260526150000_account_deletion_request`: `CompanyStatus.pending_deletion`, `User.deletionRequestedAt`, `Company.statusBeforeDeletion`. `POST /api/auth/me/request-deletion` ставит пользователя в 30-дневную очередь удаления, переводит компанию в `pending_deletion`, запоминает прежний статус, отзывает остальные сессии и создаёт security-уведомление; `POST /api/auth/me/cancel-deletion` сбрасывает запрос и восстанавливает статус компании. **Cron:** `cleanup-deleted-accounts` ежедневно под Postgres advisory lock удаляет пользователей с `deletionRequestedAt` старше 30 дней, чистит неиспользуемые `FileAsset` metadata и удаляет компанию, если пользователей больше нет. **Web:** `/account → Безопасность` получил «Опасную зону» с кнопками «Запросить удаление» / «Передумал», а `/auth/me` отдаёт `deletionRequestedAt` и `deletionScheduledFor`. Проверки: `pnpm --filter @ecoplatform/api prisma:generate`; targeted `pnpm --filter @ecoplatform/api test -- scheduler.service.test.ts auth.service.test.ts` зелёный (API unit **42/42**); targeted `pnpm --filter @ecoplatform/api test:integration` зелёный (API integration **110/110**); полный набор зелёный: `pnpm format:check`, `pnpm lint` (4/4), `pnpm test` (shared 7/7 + web 7/7 + api 42/42), `pnpm test:integration` (API integration **110/110**), `pnpm build` (3/3), `git diff --check` clean. | Codex |
| 2026-05-26 | Волна 9, задача 9.10 (password policy + Have I Been Pwned) закрыта. **Shared/Web:** общий `MIN_PASSWORD_LENGTH` поднят с 10 до 12; регистрация, смена пароля и создание platform-staff используют тот же минимум и UI-подсказки. **API:** добавлен `PasswordPolicyService`: новые пароли проверяются через Pwned Passwords range API по SHA-1 k-anonymity (`/range/{first5}`), с `Add-Padding: true`, локальным сравнением suffix/count, часовым cache по prefix, таймаутом и fail-open при недоступности внешнего API; plaintext-пароль наружу не уходит. Проверка подключена к `register`, `change-password` и `admin/staff`; integration-тесты отключают внешний вызов через `PWNED_PASSWORDS_CHECK_ENABLED=0`. **Тестовые данные:** integration-пароли обновлены под минимум 12. Проверки: `pnpm --filter @ecoplatform/shared build`; `pnpm exec prettier --check` по затронутым TS/TSX-файлам; `pnpm --filter @ecoplatform/shared lint`; `pnpm --filter @ecoplatform/web lint`; targeted API unit `vitest ... password-policy.service.test.ts auth.service.test.ts` зелёный (**9/9**); полный API integration `pnpm --filter @ecoplatform/api test:integration -- -t "смена пароля|создаёт модератора"` фактически прогнал весь файл и прошёл **110/110**. `pnpm --filter @ecoplatform/api lint` сейчас заблокирован параллельной незавершённой работой 9.7 (`apps/api/src/billing/billing.service.ts`, TS2322 вокруг audit diff payload), к 9.10 ошибка не относится. | Codex |
