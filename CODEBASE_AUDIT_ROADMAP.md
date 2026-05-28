# Полномасштабный аудит кода ЭкоПлатформы

Дата старта: 2026-05-28.

Этот файл — единая рабочая карта полной проверки MVP. Он нужен, чтобы аудит
можно было вести маленькими безопасными шагами, не терять контекст между
сессиями и не смешивать обзор всего проекта с исправлениями конкретных багов.

## Как работать с аудитом

- Один пункт проверки или один найденный баг закрывается отдельным коммитом.
- Roadmap-коммит не меняет код, API, схему БД, DTO или UI.
- Каждая находка получает ID, приоритет, понятный риск, способ проверки и
  следующий шаг.
- Статус `accepted` ставится только после проверки кода и нужных команд, а не
  по ощущениям.
- Если во время проверки найден блокирующий баг в этом же модуле, он
  оформляется как отдельная находка и исправляется отдельным коммитом.
- После context compression следующая сессия начинает с этого файла,
  `PROJECT_STATUS.md`, `README.md`, `git status --short` и последних коммитов.

Статусы проверки модулей:

- `not_started` — модуль ещё не проверялся в рамках полного аудита.
- `reviewing` — идёт чтение кода, контрактов и сценариев.
- `findings` — есть зафиксированные находки, которые ещё не закрыты.
- `fixed` — исправления внесены, проверки ещё не приняты как финальные.
- `accepted` — модуль проверен, критичных открытых находок нет.

Приоритеты находок:

- `P0` — блокирует MVP, безопасность, данные или вход/оплату/админку.
- `P1` — высокий риск: баги в правах, данных, платежах, публикации или
  пользовательских сценариях.
- `P2` — средний риск: качество, поддерживаемость, UX, покрытие тестами.
- `P3` — низкий риск: косметика, небольшая оптимизация, улучшение ясности.

## Карта проекта

| Зона | Что входит | Главные риски аудита |
| --- | --- | --- |
| `apps/api` | NestJS API, Prisma, auth, billing, CMS, moderation, admin, files, health, observability | права доступа, валидация входа, утечки данных, логические ошибки, тяжёлые запросы |
| `apps/api/prisma` | `schema.prisma`, миграции, seed, promote-first-admin script | несовпадение схемы и кода, слабые constraints, опасные миграции, seed-секреты |
| `apps/web` | Next.js App Router, публичные страницы, кабинет, админка, CMS-редакторы | сломанные сценарии, XSS, неявные 401/403, формы без защиты, mobile overflow |
| `packages/shared` | DTO, доменные типы, access rules, slug, sanitize, content-blocks | расхождение API/web контрактов, слабая валидация, небезопасный HTML |
| `ops` | Prometheus/Alertmanager examples, production runbooks в статусе проекта | секреты, неполные алерты, отсутствие проверяемых процедур отката |
| `.github` | CI workflows | неполные гейты, расхождение local/CI команд, отсутствие integration/smoke условий |
| Root config | `package.json`, `turbo.json`, `pnpm-workspace.yaml`, Docker Compose, tsconfig | неправильные scripts, кэширование не тех задач, drift окружения |

## Направления проверки

| Направление | Что проверяем | Минимальное доказательство |
| --- | --- | --- |
| Архитектура | границы модулей, зависимости, размеры файлов, повторяющаяся логика | список модулей с решением: оставить, упростить или вынести |
| Логика продукта | регистрация, demo, подписка, CMS, модерация, поддержка, удаление аккаунта | сценарии пройдены кодом, тестом или browser-check |
| Кибербезопасность | auth, CSRF, RBAC, uploads, XSS, secrets, логи, rate limit | конкретные endpoint/page проверки и отсутствие секретов в diff |
| Права доступа | admin/content-manager/moderator/user/company scopes | матрица ролей и выборочные негативные проверки |
| Данные и БД | Prisma schema, миграции, индексы, constraints, каскады, seed | schema-pass, migration-pass, targeted DB/API checks |
| API-контракты | DTO, responses, errors, pagination, idempotency | shared types не расходятся с api/web потребителями |
| Frontend/UX | routes, forms, empty/error/loading states, mobile, accessibility | browser screenshots для затронутых сценариев |
| Производительность | pagination, infinite scroll, Prisma queries, caching, bundle risks | hotspots documented, P1/P2 вынесены в очередь |
| Тесты | unit, integration, smoke, coverage by risk | выбранный набор проверок прошёл или причина отказа зафиксирована |
| CI/CD и ops | GitHub Actions, Dockerfile, health, metrics, alerts, env | local/CI commands совпадают, риск деплоя понятен |
| Наблюдаемость | pino, Sentry, metrics, traceId, privacy filters | ошибки видимы, секреты/PII не уходят в логи |
| Документация статуса | README, PROJECT_STATUS, roadmap | статус совпадает с реальным кодом и проверками |

## Волны аудита

| Волна | Фокус | Что считается результатом |
| --- | --- | --- |
| A | Инвентаризация структуры, зависимостей, scripts, env, CI, Docker | обновлена матрица модулей, зафиксированы drift/risks без правок кода |
| B | Backend, API, Prisma, auth, security, RBAC | заведены находки по P0-P2 рискам, критичные сценарии покрыты проверками |
| C | Frontend, routes, forms, admin/account, UX, accessibility | найденные UI/логические проблемы описаны с маршрутами и проверкой |
| D | Shared contracts, DTO, validation, type boundaries | расхождения контрактов записаны или подтверждено их отсутствие |
| E | Tests, integration, smoke, build, observability, deploy readiness | известна надёжность test/build/deploy цепочки |
| F | Ручная приёмка критичных пользовательских сценариев в браузере | составлен список bugfix-задач для отдельных коммитов |

## Матрица модулей

| ID | Модуль | Статус | Волна | Что проверить |
| --- | --- | --- | --- | --- |
| A-ROOT | Root config | `accepted` | A | package scripts, turbo tasks, workspace, tsconfig, docker compose |
| A-CI | `.github/workflows` | `accepted` | A/E | static checks, integration DB, smoke trigger, secrets boundary |
| A-OPS | `ops/monitoring` | `accepted` | A/E | alerts, example config, absence of real secrets |
| B-PRISMA | `apps/api/prisma` | `accepted` | B | schema, migrations, indexes, constraints, seed safety |
| B-AUTH | `apps/api/src/auth` | `accepted` | B | login, refresh, lockout, export data, deletion, password policy |
| B-COMMON | `apps/api/src/common` | `accepted` | B | guards, roles, CSRF, pagination, logging filters, sanitizing |
| B-ADMIN | `apps/api/src/admin` | `accepted` | B | RBAC, audit log, dashboard queries, admin mutations |
| B-BILLING | `apps/api/src/billing` | `accepted` | B | company profile, subscriptions, manual activation, notifications |
| B-CONTENT | `apps/api/src/content` | `accepted` | B | CMS validation, publish/preview rules, tags, indices, block payloads |
| B-FILES | `apps/api/src/files` | `accepted` | B | MIME/extension/size checks, S3 paths, public/private access |
| B-LEGAL | `apps/api/src/legal` | `accepted` | B | active documents, consent records, re-consent flow |
| B-MOD | `apps/api/src/moderation` | `accepted` | B | sanctions, report flow, module restrictions, edge cases |
| B-NOTIF | `apps/api/src/notifications` | `accepted` | B | in-app delivery, read states, privacy of notification payloads |
| B-OBS | `apps/api/src/observability` | `accepted` | E | metrics auth, labels, cardinality, Sentry/log filtering |
| B-REDIS | `apps/api/src/redis` | `accepted` | B/E | session cache invalidation, throttler fallback |
| B-SCHED | `apps/api/src/scheduler` | `accepted` | B/E | advisory locks, cleanup safety, billing cron idempotency |
| B-SUPPORT | `apps/api/src/support` | `accepted` | B | ticket ownership, admin access, status transitions |
| C-APP | `apps/web/app` | `not_started` | C | route coverage, auth boundaries, loading/error/not-found states |
| C-ADMIN | `apps/web/src/components/Admin*` | `not_started` | C | tables, filters, actions, role visibility, overflow |
| C-AUTH | `apps/web/src/components/AuthForms.tsx` | `not_started` | C | register/login UX, validation, legal consents, password rules |
| C-SHELL | `apps/web/src/components/AppShell.tsx` | `not_started` | C | navigation, demo banner spacing, account/admin separation |
| C-CMS | `apps/web/src/components/*Editor*` | `not_started` | C | blocks editor, Tiptap, preview, auto-save, XSS boundaries |
| C-LIBAPI | `apps/web/src/lib/api` | `not_started` | D | typed API client, refresh, CSRF, error handling, downloads |
| C-AUTHCTX | `apps/web/src/lib/auth.tsx` | `not_started` | C/D | session restore, 401/403 behavior, user state transitions |
| C-STYLES | `apps/web/src/styles` | `not_started` | C | tokens, contrast, responsive rules, repeated raw colors |
| D-SHARED | `packages/shared/src` | `not_started` | D | DTOs, access rules, sanitize, content-block schemas |
| E-TESTS | Tests and smoke | `not_started` | E | unit/integration/smoke coverage, flaky risks, test DB setup |
| F-ACCEPT | MVP acceptance scenarios | `not_started` | F | owner-facing flows, browser proof, bugfix queue |

## Журнал проверки модулей

### A-ROOT — Root config

Дата проверки: 2026-05-28.

Статус: `accepted`.

Проверено:

- `package.json`, `apps/*/package.json`, `packages/shared/package.json`;
- `turbo.json`, `pnpm-workspace.yaml`;
- `tsconfig.base.json`, package-level `tsconfig.json`;
- `.env.example`, `.gitignore`, `.dockerignore`;
- `docker-compose.yml`, `apps/api/Dockerfile`, `apps/web/Dockerfile`;
- сопоставление `README.md`, `PROJECT_STATUS.md` и `.github/workflows/ci.yml`
  по версии PostgreSQL.

Доказательства:

- `pnpm -v` -> `10.33.0`;
- `pnpm exec turbo --version` -> `2.9.14`;
- `pnpm exec turbo run lint --dry-run=json` -> task graph собирает
  `@ecoplatform/api`, `@ecoplatform/web`, `@ecoplatform/shared`, а `lint`
  зависит от upstream `build/lint`;
- `pnpm exec turbo run test:integration --dry-run=json` -> integration task
  cache отключён, реальный script есть в `@ecoplatform/api`;
- `pnpm exec turbo run test:smoke --dry-run=json` -> smoke task cache отключён,
  учитывает `PLAYWRIGHT_TEST_BASE_URL` и `SMOKE_TEST_EMAIL_DOMAIN`;
- `rg -n "postgres:|Postgres 18|PostgreSQL 18|5433|postgres"
  docker-compose.yml README.md PROJECT_STATUS.md .github apps packages`.

Решение:

- package scripts, pnpm workspace, TypeScript strict base, Docker ignore и
  Turborepo task graph приняты без P0/P1-рисков;
- окруженческое расхождение `F-20260528-001` закрыто: локальный Docker Compose
  теперь использует тот же major PostgreSQL, что CI и целевой деплой.

### A-CI — `.github/workflows`

Дата проверки: 2026-05-28.

Статус: `accepted`.

Проверено:

- единственный workflow `.github/workflows/ci.yml`;
- triggers `push` в `main`, `pull_request` и `deployment_status`;
- job `static-checks`: install, Prisma generate, `pnpm format:check`,
  `pnpm lint`, `pnpm test`, `pnpm build`;
- job `integration-tests`: PostgreSQL `postgres:18-alpine`, test URL на
  `localhost:5433`, dummy JWT/S3 env только для CI и
  `pnpm --filter @ecoplatform/api test:integration`;
- job `staging-smoke`: запуск только для успешного deployment status окружения
  `staging`, Playwright Chromium и `PLAYWRIGHT_TEST_BASE_URL` из deployment URL;
- соответствие scripts в root, `apps/api`, `apps/web` и `packages/shared`.

Доказательства:

- `.github/workflows/ci.yml` теперь задаёт `permissions: contents: read`;
- `pnpm exec prettier --check .github/workflows/ci.yml` -> clean;
- `apps/web/playwright.config.ts` требует `PLAYWRIGHT_TEST_BASE_URL`, а
  `apps/web/tests/smoke.spec.ts` создаёт уникального пользователя и проверяет
  register -> logout -> login -> `/news` -> `/indices` -> logout;
- `turbo.json` помечает `test:integration` и `test:smoke` как `cache: false`.

Решение:

- CI-покрытие принято без открытых P0/P1/P2-рисков;
- найденный hardening-risk `F-20260528-002` закрыт в этом же коммите: GitHub
  Actions token ограничен read-only доступом к содержимому репозитория.

### A-OPS — `ops/monitoring`

Дата проверки: 2026-05-28.

Статус: `accepted`.

Проверено:

- `ops/monitoring/ecoplatform-alerts.yml`;
- `ops/monitoring/alertmanager.example.yml`;
- соответствие alert rules метрикам в `apps/api/src/observability`;
- отсутствие реальных секретов в monitoring examples.

Доказательства:

- `ruby -e 'require "yaml"; ARGV.each { |file| YAML.load_file(file); puts "OK #{file}" }' ops/monitoring/ecoplatform-alerts.yml ops/monitoring/alertmanager.example.yml` -> оба YAML-файла парсятся;
- `pnpm exec prettier --check ops/monitoring/ecoplatform-alerts.yml ops/monitoring/alertmanager.example.yml` -> clean;
- `rg -n "(?i)(AKIA|ASIA|BEGIN (RSA|OPENSSH|EC|PRIVATE) KEY|password\\s*[:=]\\s*['\\\"]?[^\\s'\\\"]{8,}|token\\s*[:=]\\s*['\\\"]?[^\\s'\\\"]{8,}|secret\\s*[:=]\\s*['\\\"]?[^\\s'\\\"]{8,})" ops/monitoring` -> совпадений нет;
- `rg -n "http_request_duration_seconds|auth_cache_|db_connections|metrics" apps/api/src README.md PROJECT_STATUS.md ops/monitoring` -> alert rules используют реально объявленные API-метрики;
- `promtool` и `amtool` локально не установлены, поэтому строгая проверка Prometheus/Alertmanager CLI не выполнялась; YAML-структура дополнительно сверена с актуальной официальной схемой Alertmanager.

Решение:

- Prometheus rules покрывают API 5xx, p95 latency, session-cache hit rate и
  занятость Postgres-соединений без расхождения с текущими metric names;
- `alertmanager.example.yml` хранит SMTP/Telegram secrets через file-based
  secret references, реальные токены/пароли в репозитории не обнаружены;
- открытых P0/P1/P2-рисков по `ops/monitoring` нет.

### B-PRISMA — `apps/api/prisma`

Дата проверки: 2026-05-28.

Статус: `accepted`.

Проверено:

- `apps/api/prisma/schema.prisma`: модели, enum, индексы, уникальные
  ограничения, referential actions, Json/Decimal/String[] поля;
- 25 SQL-миграций в `apps/api/prisma/migrations` и
  `migration_lock.toml`;
- `apps/api/prisma/seed.ts`: создание admin/demo, демо-контента и
  обязательных юридических документов;
- `apps/api/prisma/scripts/promote-first-admin.ts`: режим dry-run,
  граница destructive write, перенос авторства и удаление лишних записей;
- соответствие `README.md`, `PROJECT_STATUS.md` и фактического числа
  миграций.

Доказательства:

- Prisma docs через Context7: контрольные точки аудита — indexes/unique,
  `onDelete/onUpdate`, migrations и seed safety;
- `docker compose ps` -> PostgreSQL 18 контейнер `healthy`;
- `postgres-local`: PostgreSQL 18.4, после миграций `25` записей в
  `_prisma_migrations`, `134` public-indexes, `2` seed-пользователя;
- `env 'DATABASE_URL=...' pnpm --filter @ecoplatform/api exec prisma validate`
  -> schema valid;
- `env 'DATABASE_URL=...' pnpm --filter @ecoplatform/api prisma:migrate` ->
  применены все 25 миграций;
- `SEED_ADMIN_PASSWORD=$(openssl rand -base64 24)
  SEED_DEMO_PASSWORD=$(openssl rand -base64 24) pnpm --filter
  @ecoplatform/api seed` -> seed проходит, пароли в stdout не печатаются;
- `PROMOTE_FIRST_ADMIN_WRITE` не задан:
  `pnpm --filter @ecoplatform/api exec ts-node
  prisma/scripts/promote-first-admin.ts` -> dry-run без записи;
- `pnpm exec prettier --check README.md PROJECT_STATUS.md
  CODEBASE_AUDIT_ROADMAP.md apps/api/prisma/seed.ts
  apps/api/prisma/scripts/promote-first-admin.ts` -> clean;
- `git diff --check` -> clean; `.env.example` проверен через diff/secret
  search, потому что Prettier не выбирает parser для env-файлов;
- `pnpm lint` -> 4 tasks successful;
- `pnpm --filter @ecoplatform/api test` -> 19 files / 76 tests passed.

Решение:

- schema/migrations/indexes/constraints приняты без открытых P0/P1/P2-рисков;
- документационный drift по числу миграций исправлен: фактическое число —
  25, а не 26;
- `F-20260528-003` закрыт: seed больше не хранит и не печатает пароли
  admin/demo, а требует `SEED_ADMIN_PASSWORD` и `SEED_DEMO_PASSWORD` из env;
- `F-20260528-004` закрыт: destructive `promote-first-admin` теперь по
  умолчанию только показывает план, запись требует явного
  `PROMOTE_FIRST_ADMIN_WRITE=1`.

### B-AUTH — `apps/api/src/auth`

Дата проверки: 2026-05-28.

Статус: `accepted`.

Проверено:

- `apps/api/src/auth/auth.controller.ts`: login/register/refresh/logout,
  sessions, `/auth/me`, смена пароля, export-data и request/cancel deletion;
- `apps/api/src/auth/auth.service.ts`: bcrypt-пароли, dummy compare,
  lockout, session refresh rotation, revoke/logout-all, re-consent,
  удаление аккаунта и уведомления безопасности;
- `apps/api/src/auth/auth-data-export.service.ts`: состав ZIP-экспорта и
  исключение `passwordHash`/`refreshTokenHash`/`providerToken`/`keyHash`;
- `apps/api/src/auth/password-policy.service.ts`: единый минимум пароля и
  Have I Been Pwned range API без отправки plaintext-пароля;
- связанные границы `apps/api/src/common/jwt-auth.guard.ts`,
  `apps/api/src/common/csrf.guard.ts`, `apps/api/src/app.module.ts`,
  `packages/shared/src/dto.ts`, `packages/shared/src/api-response.ts`,
  `apps/api/prisma/schema.prisma` и auth-блок integration-тестов.

Доказательства:

- NestJS docs через Context7: protected routes должны идти через guards,
  а пользователь добавляется в request после проверки JWT;
- Prisma docs через Context7: multi-step writes и auth-связанные операции
  сверялись с `$transaction`, `select` для чувствительных полей и
  relation/cascade boundaries;
- Express docs через Context7: `res.clearCookie()` должен получать тот же
  `path`, что и исходный `res.cookie()`;
- `rg -n "TODO|FIXME|console\\.log|\\$queryRawUnsafe|\\$executeRawUnsafe|password\\s*[:=]|token\\s*[:=]|secret\\s*[:=]|refreshTokenHash|passwordHash" apps/api/src/auth apps/api/src/common/jwt-auth.guard.ts apps/api/src/common/csrf.guard.ts apps/api/prisma/schema.prisma packages/shared/src/dto.ts packages/shared/src/api-response.ts` ->
  без production-логов, TODO, raw SQL и хардкод-секретов; совпадения по
  `passwordHash`/`refreshTokenHash` находятся только в ожидаемых местах
  хеширования, проверки, schema и тестах;
- `pnpm --filter @ecoplatform/api test -- auth` -> 19 files / 76 tests
  passed;
- `pnpm --filter @ecoplatform/api exec vitest run -c
  vitest.integration.config.ts src/app.integration.test.ts
  --testNamePattern Auth` -> 1 file passed, 20 auth tests passed, 97 skipped;
- `pnpm exec prettier --check apps/api/src/auth/auth.controller.ts
  apps/api/src/app.integration.test.ts CODEBASE_AUDIT_ROADMAP.md`;
- `pnpm --filter @ecoplatform/api lint`;
- `git diff --check`.

Решение:

- auth endpoints защищены JWT guard там, где нужна авторизация; refresh
  дополнительно проходит CSRF double-submit;
- password/refresh-token hashes не возвращаются наружу, export-data отдаёт
  ZIP с `Cache-Control: no-store`;
- lockout, refresh rotation, revoke/logout-all, смена пароля и удаление
  аккаунта покрыты unit/integration-тестами;
- открытых P0/P1/P2-рисков по `apps/api/src/auth` нет;
- `F-20260528-005` закрыт: refresh-cookie теперь очищается с тем же
  `Path=/api/auth`, с которым выдаётся.

### B-COMMON — `apps/api/src/common`

Дата проверки: 2026-05-28.

Статус: `accepted`.

Проверено:

- `apps/api/src/common/jwt-auth.guard.ts`: Bearer-token, session lookup,
  session-cache, blocked user/company boundaries и request.user snapshot;
- `apps/api/src/common/roles.guard.ts` и `roles.decorator.ts`: role metadata
  через `Reflector.getAllAndOverride`, class/method override и 403 для роли без
  доступа;
- `apps/api/src/common/csrf.guard.ts` вместе с `apps/api/src/main.ts` и
  `apps/api/src/test/test-app.ts`: cookie-parser -> CSRF cookie middleware ->
  global CSRF guard, safe methods и исключения только для login/register;
- `apps/api/src/common/pagination.ts` и потребители в content/admin/moderation:
  clamping `limit/offset/page/take`, общий `PaginatedResponse`;
- `apps/api/src/common/logging.ts`,
  `apps/api/src/common/global-exception.filter.ts` и
  `apps/api/src/common/sentry.ts`: traceId, actorRole, 4xx/5xx handling,
  redaction токенов/cookie/CSRF/PII;
- `apps/api/src/common/admin-action-log.service.ts`,
  `module-access.service.ts`, `zod.ts`, `sanitize-html.ts`,
  `simple-zip.ts` и связанные unit/integration-тесты.

Доказательства:

- NestJS docs через Context7: guards, global guard registration через DI,
  metadata/Reflector для ролей и request-scoped authorization;
- Express docs через Context7: middleware выполняется в порядке регистрации,
  cookie handling сверялся с текущей цепочкой `cookieParser()` ->
  `csrfCookieMiddleware`;
- `rg -n "@UseGuards|JwtAuthGuard|RolesGuard|@Roles|SkipThrottle|Throttle|csrf|CSRF" apps/api/src --glob '*.ts'` -> admin/content/moderation/support/files/health маршруты используют ожидаемые guard boundaries;
- `rg -n "resolvePagination|paginatedResponse|limit|offset|page|take" apps/api/src --glob '*.ts'` -> общий helper используется в новых admin/content/moderation листингах, старые локальные clamp-паттерны остаются в доменных сервисах без P0/P1 риска;
- `rg -n "sanitizeParagraphHtml|sanitize|dangerously|html" apps/api/src apps/web/src packages/shared/src --glob '*.ts' --glob '*.tsx'` -> API и web используют общий `@ecoplatform/shared` sanitizer перед сохранением/рендером HTML;
- `rg -n "TODO|FIXME|console\\.log|\\$queryRawUnsafe|\\$executeRawUnsafe|password\\s*[:=]|token\\s*[:=]|secret\\s*[:=]|Authorization|cookie|csrf|session|email|phone|address|inn|kpp|ogrn|bank|account" apps/api/src/common apps/api/src/main.ts apps/api/src/app.module.ts` -> без production `console.log`, TODO/FIXME, raw SQL и хардкод-секретов; совпадения находятся в redaction/test/type местах;
- `pnpm --filter @ecoplatform/api test -- common` -> 19 files / 76 tests
  passed;
- `pnpm --filter @ecoplatform/api exec vitest run -c
  vitest.integration.config.ts --testNamePattern
  "CSRF|csrf|401|403|только admin|обычный пользователь|прав"` -> 1 file
  passed, 13 tests passed, 104 skipped.

Решение:

- `apps/api/src/common` принят без открытых P0/P1/P2-рисков;
- CSRF double-submit применён ко всем mutating routes кроме login/register,
  refresh дополнительно проверяется integration-тестом;
- RBAC строится поверх `JwtAuthGuard`: `RolesGuard` не выдаёт доступ без
  `request.user.platformRoles`, admin-only и 403-сценарии покрыты
  integration-тестами;
- логирование и Sentry не отправляют наружу Authorization/cookie/CSRF,
  token/password/session и основные PII-поля;
- новых находок в реестр не добавлено.

### B-ADMIN — `apps/api/src/admin`

Дата проверки: 2026-05-28.

Статус: `accepted`.

Проверено:

- `apps/api/src/admin/users`: список/карточка пользователей, block/unblock,
  управление platform-roles, защита self/last-admin/owner-account;
- `apps/api/src/admin/companies`: список/карточка компаний, смена статуса,
  отзыв сессий при блокировке/архивации;
- `apps/api/src/admin/staff`: список staff, создание платформенных
  сотрудников, update ролей/активности, политика паролей;
- `apps/api/src/admin/journals`: фильтры, pagination, actor/entity summaries;
- `apps/api/src/admin/settings`: allow-list ключей, zod-валидация значений,
  cache и audit-log;
- `apps/api/src/admin/dashboard`: KPI, регистрационный график, последние
  audit-log события;
- связанные `AdminActionLogService`, `SessionCacheService`, `AppModule`,
  integration/unit-тесты и shared response types.

Доказательства:

- NestJS docs через Context7: controller/method guards, role metadata через
  `Reflector`, request-body validation до service calls;
- Prisma docs через Context7: `select` для чувствительных полей, count/aggregate
  dashboard-запросы, parameterized `$queryRaw` и транзакции для связанных
  write-операций;
- `rg -n "@Controller\\(|@UseGuards|@Roles|@Get\\(|@Post\\(|@Patch\\(|@Delete\\("
  apps/api/src/admin apps/api/src/billing/billing.controller.ts
  apps/api/src/legal/admin-legal.controller.ts` -> admin users/companies/staff,
  journals/settings/dashboard закрыты `JwtAuthGuard + RolesGuard` и `admin`;
  admin-legal/admin-billing имеют свои роли и уйдут в отдельные модули
  `B-LEGAL`/`B-BILLING`;
- `rg -n "TODO|FIXME|console\\.log|\\$queryRawUnsafe|\\$executeRawUnsafe"
  apps/api/src/admin apps/api/src/common/admin-action-log.service.ts` ->
  совпадений нет;
- `rg -n "passwordHash|refreshTokenHash|providerToken|keyHash"
  apps/api/src/admin` -> после исправления совпадения только в локальном
  создании bcrypt-хэша staff-пароля, не в response `select`;
- `pnpm --filter @ecoplatform/api test -- admin` -> 19 files / 76 tests
  passed;
- `pnpm --filter @ecoplatform/api exec vitest run -c
  vitest.integration.config.ts --testNamePattern
  "Admin users panel|Admin companies panel|Admin journals|Platform settings|Admin staff panel"`
  -> 1 file passed, 26 tests passed, 92 skipped.

Решение:

- `apps/api/src/admin` принят без открытых P0/P1/P2-рисков;
- `F-20260528-006` закрыт: `/api/admin/users/:id/platform-roles` теперь
  защищает `PLATFORM_OWNER_EMAIL` так же, как staff endpoint;
- `F-20260528-007` закрыт: `POST /api/admin/staff` больше не возвращает
  `passwordHash`;
- `F-20260528-008` закрыт: `GET /api/admin/staff` валидирует query через zod
  и отдаёт 400 на нечисловой `limit`;
- audit-log покрывает admin user/company/staff/settings mutations; dashboard
  использует ограниченные `select` и безопасный parameterized `$queryRaw` для
  дневного ряда регистраций.

### B-BILLING — `apps/api/src/billing`

Дата проверки: 2026-05-28.

Статус: `accepted`.

Проверено:

- `BillingController`: пользовательский `/billing/status`, обновление профиля
  компании, admin-only список компаний и ручная активация подписки;
- `BillingService`: транзакционное сохранение реквизитов/адресов,
  pagination списка компаний, idempotency-key ручной активации, audit-log и
  уведомление пользователей компании;
- `BillingNotificationsService`: hourly demo/subscription expiring/expired
  проверки, перевод статусов и дедупликация уведомлений;
- shared DTO/API-типы для billing, `AdminBillingView`, Prisma-модели
  `Company`, `Subscription`, `IdempotencyKey`, `InAppNotification` и
  `NotificationDelivery`.

Доказательства:

- NestJS docs через Context7: guards закрывают доступ до controller method,
  pipes/DTO-валидация должны отклонять плохой query/body до service calls;
- Prisma docs через Context7: для связанных write-операций нужны транзакции,
  для response — явный `select`/ограниченный `include`, raw SQL должен быть
  параметризованным;
- `rg -n "@Controller\\(|@UseGuards|@Roles|@Get\\(|@Post\\(|@Patch\\("
  apps/api/src/billing apps/api/src/app.module.ts` -> пользовательские billing
  routes закрыты `JwtAuthGuard`, admin billing routes дополнительно закрыты
  `RolesGuard + admin`;
- `rg -n "TODO|FIXME|console\\.log|\\$queryRawUnsafe|\\$executeRawUnsafe"
  apps/api/src/billing packages/shared/src/dto.ts` -> совпадений нет;
- `rg -n "idempotencyKey|adminActionLog|subscription\\.create|subscription\\.updateMany|company\\.update|createInApp|manualSubscriptionDtoSchema|adminBillingCompaniesQuerySchema"
  apps/api/src/billing packages/shared/src/dto.ts apps/api/src/app.integration.test.ts`
  -> ручная активация использует idempotency-key, audit-log, уведомления и
  regression-тесты;
- `pnpm --filter @ecoplatform/shared build` -> clean;
- `pnpm --filter @ecoplatform/api exec vitest run -c
  vitest.integration.config.ts --testNamePattern
  "Demo gating|Billing notifications|Company profile"` -> 15 passed, 105
  skipped, 120 total.
- `pnpm lint` -> 4 tasks successful;
- `pnpm test` -> shared 7, web 50, api 76 tests passed;
- `pnpm build` -> shared/api/web build successful;
- `pnpm format:check` -> clean;
- `git diff --check` -> clean.

Решение:

- `apps/api/src/billing` принят без открытых P0/P1/P2-рисков;
- `F-20260528-009` закрыт: ручная активация подписки больше не принимает
  `endsAt` в прошлом и не может поставить компанию в `active` с уже истёкшей
  подпиской;
- `F-20260528-010` закрыт: `GET /api/admin/billing/companies` валидирует
  pagination query через zod и отдаёт 400 на нечисловой `limit`.

### B-CONTENT — `apps/api/src/content`

Дата проверки: 2026-05-28.

Статус: `accepted`.

Проверено:

- `ContentController`: публичные маршруты `news`, `indices`, `education`,
  `knowledge-base`, admin-CMS CRUD, publish/unpublish/delete и role guards;
- `content.schemas.ts`: zod-схемы body/query для новостей, индексов, обучения,
  базы знаний и pagination query;
- `NewsService`: публичная выдача, теги, preview, publish/unpublish/delete,
  лайки и комментарии через `Discussion(news_post, id)`;
- `IndicesService`: категории, номенклатура, индексы цен, значения индекса,
  публикация и audit-log;
- `LearningService`: модули, главы, уроки, preview, publishable-проверки,
  доступ по подписке и прогресс уроков;
- `KnowledgeBaseService`: дерево, поиск, CRUD, publish/unpublish, move и
  ограничение глубины;
- `ContentCommonService`, shared content-block schemas, sanitizer и
  `FilesService.assertCoverImageAllowed`.

Доказательства:

- NestJS docs через Context7: controller/method guards и role metadata должны
  закрывать маршруты до вызова service-кода, а validation должна отклонять
  плохой input на границе controller;
- Prisma docs через Context7: Prisma Client безопасен по умолчанию, raw SQL не
  используется; для связанных write-операций сверялись transaction/upsert/select
  границы;
- Zod docs через Context7: query/body проходят через `safeParse`, ошибки
  превращаются в 400 через `parseBody`;
- `rg -n "@Controller\\(|@UseGuards|@Roles|@Get\\(|@Post\\(|@Patch\\(|@Delete\\("
  apps/api/src/content apps/api/src/app.module.ts` -> content controller закрыт
  class-level `JwtAuthGuard`, admin routes дополнительно закрыты `RolesGuard`;
- `rg -n "TODO|FIXME|console\\.log|\\$queryRawUnsafe|\\$executeRawUnsafe"
  apps/api/src/content packages/shared/src/content-blocks.ts
  packages/shared/src/sanitize-html.ts` -> совпадений нет;
- `rg -n "sanitizeParagraphHtml|validateContentBlocks|assertCoverImageAllowed|recordEntityReferences|adminActionLog|newsListQuerySchema|knowledgeTreeQuerySchema|indices.value.create"
  apps/api/src/content packages/shared/src apps/api/src/files/files.service.ts
  apps/api/src/app.integration.test.ts` -> HTML sanitizing, block validation,
  cover-image ownership, FileReference, audit-log и query validation подключены;
- `pnpm --filter @ecoplatform/api test` -> 19 files / 76 tests passed;
- `pnpm --filter @ecoplatform/api test:integration -- --testNamePattern
  "Content publish|Content lifecycle: price indices|Discussion|Wave 8.4 pagination contracts"`
  -> integration-файл прошёл полностью: 123 tests passed;
- `pnpm lint` -> 4 tasks successful;
- `pnpm test` -> shared 7, web 50, api 76 tests passed;
- `pnpm build` -> shared/api/web build successful;
- `pnpm format:check` -> clean;
- `git diff --check` -> clean.

Решение:

- `apps/api/src/content` принят без открытых P0/P1/P2-рисков;
- `F-20260528-011` закрыт: комментарии больше нельзя создать к черновой,
  отсутствующей новости или как reply к комментарию из другой новости;
- `F-20260528-012` закрыт: content-листинги валидируют numeric query через zod
  и отдают 400 вместо молчаливого fallback на дефолтную pagination;
- `F-20260528-013` закрыт: добавление/обновление значения индекса проверяет
  существование индекса, отдаёт 404 для несуществующего id и пишет admin audit
  log.

### B-FILES — `apps/api/src/files`

Дата проверки: 2026-05-28.

Статус: `accepted`.

Проверено:

- `FilesController`: список публичных файлов по id, metadata-only создание,
  multipart upload, role guards и удаление неиспользуемых файлов;
- `FilesService`: S3 config/health, magic-number MIME detection, блок-лист
  опасных MIME/расширений, лимиты размера, дневная квота, storage key,
  public/private URL, WebP/AVIF варианты, FileReference и cleanup;
- `image-presets.ts`: обработка cover-изображений через `sharp`;
- `FileAsset`/`FileReference` в Prisma schema, связи с content-сервисами,
  `FileUploadField` и web API upload/delete helpers.

Доказательства:

- NestJS docs через Context7: file upload строится через
  `FileInterceptor`, protected routes закрываются guards до вызова handler, а
  file/body validation должна отбрасывать плохой input на границе API;
- Prisma docs через Context7: Prisma Client безопасен по умолчанию, raw SQL в
  этом модуле не используется, связанные writes/cleanup сверены с transaction и
  relation-boundaries;
- file-type docs через Context7: тип файла надо определять по magic numbers;
  неизвестный тип возвращается как `undefined`, поэтому клиентскому
  `Content-Type` нельзя доверять как единственному источнику правды;
- `rg -n "TODO|FIXME|console\\.log|\\$queryRawUnsafe|\\$executeRawUnsafe"
  apps/api/src/files apps/api/src/health/health-dependency.indicator.ts
  apps/web/src/components/FileUploadField.tsx apps/web/src/lib/api/core.ts` ->
  совпадений нет;
- `rg -n "validateMetadataInput|validateUpload|BLOCKED_UPLOAD|ALLOWED_DETECTED|assertDailyUploadQuota|canDeleteAsset|deleteIfUnreferenced|FileReference|assertCoverImageAllowed|processCoverImage"
  apps/api/src/files apps/api/src/app.integration.test.ts
  apps/api/prisma/schema.prisma apps/api/src/content` -> safe-type validation,
  quota, owner/admin-delete boundary, FileReference и cover ownership
  подключены;
- `pnpm --filter @ecoplatform/api test -- files` -> 19 files / 80 tests
  passed;
- `pnpm --filter @ecoplatform/api test:integration -- --testNamePattern
  "Files API"` -> integration-файл прошёл полностью;
- `pnpm --filter @ecoplatform/api lint` -> clean;
- `pnpm exec prettier --check apps/api/src/files/files.controller.ts
  apps/api/src/files/files.service.ts apps/api/src/files/files.service.test.ts
  apps/api/src/app.integration.test.ts` -> clean после форматирования;
- `git diff --check` -> clean.

Решение:

- `apps/api/src/files` принят без открытых P0/P1/P2-рисков;
- `F-20260528-014` закрыт: metadata-only endpoint больше не обходит
  safe-type проверки, лимит размера, дневную квоту и безопасную генерацию
  storage key;
- `F-20260528-015` закрыт: content-manager больше не может удалить чужой
  неиспользуемый файл через `/api/files/:id`; удаление чужих файлов оставлено
  только для admin.

### B-LEGAL — `apps/api/src/legal`

Дата проверки: 2026-05-28.

Статус: `accepted`.

Проверено:

- `LegalController`: публичные документы, фильтр `types`, detail-route,
  авторизованные consent endpoints;
- `AdminLegalController`: guards, роли `admin/content_manager`, создание и
  публикация версий, audit-log;
- `LegalService`: active/published boundaries, запись `ConsentRecord`,
  re-consent по активным обязательным документам, idempotent createMany;
- связи с `AuthService.register()` и `/auth/me.requiresReConsent`;
- Prisma-модели `LegalDocument` и `ConsentRecord`, shared DTO/response types,
  web-формы регистрации и cookie-consent.

Доказательства:

- NestJS docs через Context7: protected routes должны закрываться guards, роли
  проверяются через metadata/guard, а плохой input должен отбрасываться на
  controller boundary;
- Prisma docs через Context7: publish/deactivate сверялся с transaction,
  `@@unique([type, version])`, `createMany({ skipDuplicates: true })` и
  ограниченными `select/include`;
- `rg -n "LegalDocument|ConsentRecord|acceptedDocumentIds|requiresReConsent|legal|consent"
  apps/api/src apps/web/src apps/web/app packages/shared/src
  apps/api/prisma/schema.prisma apps/api/prisma/seed.ts` -> найдены и
  проверены все основные потребители legal/consent flow;
- `rg -n "TODO|FIXME|console\\.log|\\$queryRawUnsafe|\\$executeRawUnsafe"
  apps/api/src/legal packages/shared/src/dto.ts packages/shared/src/api-response.ts`
  -> совпадений нет;
- `pnpm --filter @ecoplatform/api test:integration -- --testNamePattern
  "Legal documents & consents"` -> integration-файл прошёл полностью:
  126 tests passed;
- `pnpm lint` -> 4 tasks successful;
- `pnpm test` -> shared 7, web 50, api 80 tests passed;
- `pnpm build` -> shared/api/web build successful;
- `pnpm format:check` -> clean;
- `git diff --check` -> clean.

Решение:

- `apps/api/src/legal` принят без открытых P0/P1/P2-рисков;
- регистрация и re-consent проверяют активные обязательные документы и пишут
  `ConsentRecord` с source/ip/user-agent;
- публикация новой версии документа деактивирует старую версию в транзакции и
  пишет admin audit-log;
- `F-20260528-016` закрыт: публичный detail-route больше не отдаёт
  неопубликованные черновики, а неизвестные legal document type в path/query
  возвращают 400 вместо 500 или молчаливой выдачи всех документов.

### B-MOD — `apps/api/src/moderation`

Дата проверки: 2026-05-28.

Статус: `accepted`.

Проверено:

- `ModerationController`: создание жалоб, admin/moderator list/detail,
  lock/release, решения модератора, admin-санкции и снятие санкций;
- `moderation.schemas.ts`: body/query validation для жалоб, решений,
  admin-санкций, снятия санкций и pagination списка кейсов;
- `ModerationService`: дедупликация жалоб, active-case агрегация, lock limits,
  remove_content / warn_company / escalate_to_admin, user/company/module
  sanctions, lift flow, уведомления и audit-log;
- связи с `ModuleAccessService`, `SessionCacheService`, `NotificationsService`,
  `AdminActionLogService`, Prisma-моделями `ModerationCase`, `Complaint`,
  `ModerationDecision`, `Sanction`, `UserModuleRestriction`;
- integration-сценарии жалоб, санкций, ограничений модулей и pagination
  contract.

Доказательства:

- NestJS docs через Context7: controller/method guards, role metadata через
  `Reflector`, protected routes и request validation на controller boundary;
- Prisma docs через Context7: связанные writes внутри transaction, безопасный
  Prisma Client по умолчанию и запрет unsafe raw SQL со строковой
  конкатенацией;
- Zod docs через Context7: `safeParse` и `.superRefine()` для условных полей
  вроде `reasonCode=other`;
- `rg -n "@Controller\\(|@UseGuards|@Roles|@Get\\(|@Post\\("
  apps/api/src/moderation apps/api/src/app.module.ts` -> public complaint route
  закрыт `JwtAuthGuard`, admin routes закрыты `RolesGuard` и ролями
  `admin/moderator` или только `admin`;
- `rg -n "TODO|FIXME|console\\.log|\\$queryRawUnsafe|\\$executeRawUnsafe"
  apps/api/src/moderation apps/api/src/common/module-access.service.ts` ->
  совпадений нет;
- `pnpm --filter @ecoplatform/api lint` -> clean;
- `pnpm --filter @ecoplatform/api test -- moderation` -> 19 files / 81 tests
  passed;
- `pnpm --filter @ecoplatform/api test:integration -- --testNamePattern
  "Moderation|Admin sanctions|Wave 8.4 pagination contracts"` ->
  integration-файл прошёл полностью: 129 tests passed.
- `pnpm lint` -> 4 tasks successful;
- `pnpm test` -> shared 7, web 50, api 81 tests passed;
- `pnpm build` -> shared/api/web build successful;
- `pnpm test:integration` -> 129 integration tests passed;
- `pnpm format:check` -> clean;
- `git diff --check` -> clean.

Решение:

- `apps/api/src/moderation` принят без открытых P0/P1/P2-рисков;
- `F-20260528-017` закрыт: список кейсов модерации валидирует pagination query
  через zod и отдаёт 400 на нечисловой `limit`;
- `F-20260528-018` закрыт: user/company block санкции инвалидируют
  session-cache после принудительного отзыва сессий;
- `F-20260528-019` закрыт: admin-санкция `user_block` больше не может
  заблокировать самого администратора или защищённый `PLATFORM_OWNER_EMAIL`;
- `F-20260528-020` закрыт: снятие user/company block не активирует цель, если
  есть другой активный block, и для компании возвращает прежний статус;
- `F-20260528-021` закрыт: `reasonCode=other` при снятии санкции требует
  комментарий так же, как остальные moderation-решения.

### B-NOTIF — `apps/api/src/notifications`

Дата проверки: 2026-05-28.

Статус: `accepted`.

Проверено:

- `NotificationsController`: list, unread-count, read-all, read, archive и
  preferences endpoints под `JwtAuthGuard`;
- `NotificationsService`: создание in-app/email-delivery записей, дедупликация
  через `domainEventId`, mute preferences, read/archive ownership и list scope;
- Prisma-модели `InAppNotification`, `NotificationDelivery` и
  `UserNotificationPreferences`;
- потребители уведомлений в `auth`, `billing`, `moderation`, `support`, web
  `NotificationBell`, `NotificationsView` и account notification settings.

Доказательства:

- NestJS docs через Context7: protected endpoints закрываются guard'ами, а
  invalid input должен отбрасываться на controller boundary до service logic;
- Zod docs через Context7: `safeParse` даёт явную success/error ветку, а
  numeric query надо валидировать до передачи в pagination logic;
- Prisma docs через Context7: upsert по compound unique keys и transaction
  сверены с `@@unique([domainEventId, userId])` и
  `@@unique([domainEventId, recipientUserId, channel])`;
- `rg -n "TODO|FIXME|console\\.log|\\$queryRawUnsafe|\\$executeRawUnsafe"
  apps/api/src/notifications` -> совпадений нет;
- `pnpm --filter @ecoplatform/api test -- notifications` -> 19 files / 81
  tests passed;
- `pnpm --filter @ecoplatform/api test:integration -- --testNamePattern
  "notifications|Email channel queue"` -> integration-файл прошёл полностью:
  131 tests passed.

Решение:

- `apps/api/src/notifications` принят без открытых P0/P1/P2-рисков;
- `F-20260528-022` закрыт: `GET /api/notifications?limit=abc` теперь
  валидируется через zod и отдаёт 400, а не молчаливый дефолт pagination;
- `F-20260528-023` закрыт: публичные ответы notifications API больше не
  отдают внутренний `payload`, `domainEventId`, `sourceId`, `deliveryId` и
  `userId`; preferences API возвращает только публичные списки категорий;
- `F-20260528-024` закрыт: mute in-app канала больше не гасит отдельную
  email-delivery очередь, если email-канал для категории не отключён.

### B-OBS — `apps/api/src/observability`

Дата проверки: 2026-05-28.

Статус: `accepted`.

Проверено:

- `MetricsController`, `metrics-auth.ts`, `MetricsService`: `/api/metrics`,
  Basic Auth в production, `Content-Type`, `Cache-Control: no-store` и
  поведение при отсутствующих credentials;
- `metrics.registry.ts`, `MetricsMiddleware`, `BusinessMetricsCollector`:
  Prometheus registry, default metrics, HTTP/Prisma histograms, auth-cache
  counters, business counters, `subscriptions_active` и `db_connections`;
- `apps/api/src/common/logging.ts`, `global-exception.filter.ts`,
  `sentry.ts`: traceId, pino redaction, 4xx/5xx handling, Sentry filtering;
- web Sentry helpers в `apps/web/sentry.shared.ts` и Sentry config-файлы,
  потому что privacy-фильтр общий по смыслу для API и web;
- связи с `AppModule`, `main.ts`, `PrismaService`, `JwtAuthGuard`,
  `NotificationsService`, `README.md` и `PROJECT_STATUS.md`.

Доказательства:

- Prom-client docs через Context7: custom registry, `collectDefaultMetrics`,
  `registry.contentType`, async `Gauge.collect()` и стабильные label names;
- Sentry JavaScript docs через Context7: `beforeSend` может менять или
  отбрасывать event, `sendDefaultPii: false` отключает PII по умолчанию,
  `setUser` должен получать только безопасный `id`;
- NestJS docs через Context7: `@Res({ passthrough: true })` позволяет ставить
  headers и вернуть строку через стандартную обработку Nest;
- `rg -n "TODO|FIXME|console\\.log|\\$queryRawUnsafe|\\$executeRawUnsafe|password\\s*[:=]|token\\s*[:=]|secret\\s*[:=]|Authorization|cookie|csrf|session|email|phone|address|inn|kpp|ogrn|bank|account" apps/api/src/observability apps/api/src/common/sentry.ts apps/api/src/common/logging.ts apps/api/src/common/global-exception.filter.ts apps/web/sentry.shared.ts apps/web/sentry.*.config.ts apps/web/instrumentation*.ts` -> совпадения только в auth/redaction/test/config местах, без production `console.log`, TODO/FIXME и unsafe raw SQL;
- `pnpm --filter @ecoplatform/api test -- sentry` -> 19 files / 81 tests
  passed;
- `pnpm --filter @ecoplatform/web test -- sentry` -> 14 files / 50 tests
  passed;
- `pnpm --filter @ecoplatform/api test:integration -- --testNamePattern
  "Prometheus|metrics"` -> integration-файл прошёл полностью: 131 tests
  passed;
- `pnpm lint` -> 4 tasks successful;
- `pnpm test` -> shared 7, web 50, api 81 tests passed;
- `pnpm build` -> shared/api/web build successful;
- `pnpm test:integration` -> 131 integration tests passed;
- `pnpm format:check` -> clean;
- `git diff --check` -> clean.

Решение:

- `apps/api/src/observability` принят без открытых P0/P1/P2-рисков;
- `/api/metrics` в production закрыт Basic Auth и при отсутствии credentials
  отдаёт 503 вместо раскрытия метрик;
- metric labels ограничены стабильными значениями: method, route pattern,
  status, Prisma target, notification category/channel и `db_connections`
  state `used|max`;
- Sentry и pino не отправляют Authorization/cookie/CSRF, token/password/session
  и основные PII-поля; 4xx события отбрасываются, 5xx попадают в Sentry после
  redaction;
- `F-20260528-025` закрыт: Sentry privacy-фильтр теперь чистит чувствительные
  поля не только в body/extra, но и в URL query и строковых сообщениях.

### B-REDIS — `apps/api/src/redis`

Дата проверки: 2026-05-28.

Статус: `accepted`.

Проверено:

- `RedisService`: lifecycle ioredis, `lazyConnect`, отключённая offline queue,
  command timeout, fallback-режим, JSON get/set, set-indexes, `del`,
  `smembers`, `ping` и shutdown;
- `SessionCacheService`: 60-секундный кеш `RequestUser`, индексы сессий по
  user/company и инвалидация session/user/company;
- `RedisThrottlerStorageService`: Lua-backed счётчик, block key,
  fallback на `ThrottlerStorageService` и формат ответа `@nestjs/throttler`;
- связи с `JwtAuthGuard`, auth/logout/refresh/revoke/logout-all, admin
  user/company/staff changes, moderation block sanctions, health readiness и
  Prometheus auth-cache counters.

Доказательства:

- ioredis docs через Context7: проверены connection lifecycle,
  `enableOfflineQueue`, `maxRetriesPerRequest`, command errors, expiration,
  set membership, multi-key `del` и graceful shutdown;
- NestJS Throttler docs через Context7: custom storage сверен с
  `increment(key, ttl, limit, blockDuration, throttlerName)` и response
  `{ totalHits, timeToExpire, isBlocked, timeToBlockExpire }`;
- installed `@nestjs/throttler@6.5.0` source: `seconds()` возвращает
  milliseconds, default storage возвращает `timeToExpire` в секундах;
- `rg -n "sessionCache\\.|invalidateSession|invalidateUser|invalidateCompany|SessionCacheService" apps/api/src --glob '*.ts'` -> logout/refresh/revoke/logout-all, admin user/company/staff и moderation block paths инвалидируют кеш;
- `pnpm --filter @ecoplatform/api exec vitest run
  src/redis/redis.service.test.ts src/redis/session-cache.service.test.ts
  src/redis/redis-throttler-storage.service.test.ts
  src/common/jwt-auth.guard.test.ts` -> 4 files / 7 tests passed;
- `pnpm --filter @ecoplatform/api exec tsc --noEmit --pretty false` -> clean;
- `pnpm lint` -> 4 tasks successful;
- `pnpm test` -> shared 7, web 50, api 82 tests passed;
- `pnpm build` -> shared/api/web build successful;
- `pnpm test:integration` -> 131 integration tests passed;
- `pnpm format:check` -> clean;
- `git diff --check` -> clean.

Решение:

- `apps/api/src/redis` принят без открытых P0/P1/P2-рисков;
- Redis остаётся optional-зависимостью: если он не настроен или недоступен,
  auth идёт в БД, throttler — в in-memory storage, readiness честно показывает
  fallback/down state;
- `F-20260528-026` закрыт: после любой ошибки Redis-команды API временно не
  доверяет Redis и уходит в fallback на время TTL session-cache, чтобы
  не читать потенциально старую сессию после неудачной инвалидации.

### B-SCHED — `apps/api/src/scheduler`

Дата проверки: 2026-05-28.

Статус: `accepted`.

Проверено:

- `SchedulerService`: hourly `billing-hourly-check`, nightly
  `cleanup-deleted-accounts`, `SCHEDULER_DISABLED`, named cron jobs и
  PostgreSQL advisory-lock через `pg_try_advisory_xact_lock`;
- `cleanupDeletedAccounts()`: 30-дневный grace-period, batch-limit,
  транзакционная очистка user/file/company/address данных и восстановление
  статуса компании при отменённых/оставшихся пользователях;
- `BillingNotificationsService`: demo/subscription expiring/expired ветки,
  перевод статусов и дедупликация уведомлений через `domainEventId`;
- Prisma-связи `User`, `Company`, `Subscription`, `FileAsset`,
  `FileReference`, `Address`, а также integration-сценарии удаления аккаунта и
  billing notifications.

Доказательства:

- NestJS Schedule docs через Context7: `@Cron` принимает cron expression,
  job `name`, `disabled`/concurrency options; текущие jobs названы и
  дополнительно пропускаются через `SCHEDULER_DISABLED`;
- Prisma docs через Context7: raw SQL должен идти через параметризованный
  `$queryRaw` tagged template; advisory-lock и row-lock запросы используют
  параметры, без string-concat и без `$queryRawUnsafe`;
- `rg -n "Cron|Scheduler|scheduler|billing-hourly-check|cleanup-deleted-accounts|pg_try_advisory_xact_lock|\\$transaction|deleteMany|deletionRequestedAt|Idempotency|advisory" apps/api/src apps/api/prisma/schema.prisma packages/shared/src --glob '*.ts' --glob '*.prisma'`;
- `pnpm --filter @ecoplatform/api test -- scheduler` -> 20 files / 83 tests
  passed;
- `pnpm --filter @ecoplatform/api test:integration -- --testNamePattern
  "cleanup-deleted-accounts|Billing notifications"` -> integration-файл прошёл
  полностью: 131 tests passed;
- `pnpm lint` -> 4 tasks successful;
- `pnpm test` -> shared 7, web 50, api 83 tests passed;
- `pnpm build` -> shared/api/web build successful;
- `pnpm format:check` -> clean;
- `git diff --check` -> clean.

Решение:

- `apps/api/src/scheduler` принят без открытых P0/P1/P2-рисков;
- scheduler можно отключить через `SCHEDULER_DISABLED=1`, а штатные cron jobs
  не дублируются между репликами из-за PostgreSQL advisory-lock;
- billing-cron остаётся идемпотентным по статусам и уведомлениям: повторные
  запуски не создают дублирующие notifications;
- `F-20260528-027` закрыт: nightly account-deletion cleanup теперь берёт
  `FOR UPDATE` row-lock на кандидатов перед удалением файлов/пользователей,
  чтобы параллельная отмена удаления не могла привести к потере данных.

### B-SUPPORT — `apps/api/src/support`

Дата проверки: 2026-05-28.

Статус: `accepted`.

Проверено:

- `SupportController`: клиентские `/support/tickets`, ответы пользователя,
  admin-only `/admin/support/tickets` и role guards;
- `SupportService`: создание тикета, списки компании/admin, ответы,
  статусы `in_progress/awaiting_user` и notifications;
- shared DTO `supportTicketDtoSchema`, Prisma-модели `SupportTicket` /
  `SupportTicketMessage`, web-потребители drawer/admin inbox и integration
  сценарии владения тикетом.

Доказательства:

- NestJS docs через Context7: protected routes закрываются guards до handler
  logic, role guard читает роли из authenticated request;
- Prisma docs через Context7: API-ответы должны использовать scoped
  `select/include`, связанные write-операции — транзакции;
- Zod docs через Context7: query/body валидируются через schema parse, плохие
  numeric query должны отклоняться на API-границе;
- `rg -n "support|Support|ticket|SupportTicket|B-SUPPORT" apps/api/src
  apps/api/prisma packages/shared/src apps/web/src apps/web/app`;
- `pnpm --filter @ecoplatform/shared build` -> clean;
- `pnpm --filter @ecoplatform/api test -- support` -> 20 files / 84 tests
  passed;
- `pnpm --filter @ecoplatform/api exec tsc --noEmit --pretty false` -> clean;
- `pnpm --filter @ecoplatform/api test:integration -- --testNamePattern
  "Support ownership"` -> integration-файл прошёл полностью: 132 tests
  passed.

Решение:

- `apps/api/src/support` принят без открытых P0/P1/P2-рисков;
- компания видит только свои обращения, чужая компания получает 404 при
  попытке ответа, admin endpoints закрыты `JwtAuthGuard + RolesGuard + admin`;
- `F-20260528-028` закрыт: пользовательская выдача тикетов и ответ клиента
  больше не отдают внутренние support-сообщения `isInternal=true` и служебные
  `authorId/ticketId` сообщений;
- `F-20260528-029` закрыт: support list query валидируется через zod, пустые
  после trim тема/ответ отклоняются 400, длина темы/сообщения ограничена.

## Реестр находок

Новые строки добавляются только после проверки конкретного кода или сценария.

| Finding ID | Priority | Area | Risk in plain words | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `F-20260528-001` | `P2` | `docker-compose.yml` | Локальная разработка и integration-тесты могли идти на PostgreSQL 16, а CI и целевой деплой — на PostgreSQL 18. Из-за этого часть SQL/Prisma-проблем могла проявиться только в CI или prod-like среде. | Исправлено: `docker-compose.yml:3` = `postgres:18-alpine`, volume смонтирован в `/var/lib/postgresql`, жёсткие `container_name` убраны. Проверено: `docker compose config`; `docker compose up -d postgres` -> `healthy`; `pnpm --filter @ecoplatform/api prisma:generate`; `pnpm --filter @ecoplatform/api test:integration` -> 116 passed. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-002` | `P2` | `.github/workflows/ci.yml` | CI не фиксировал минимальные права `GITHUB_TOKEN`, поэтому будущие jobs могли случайно получить больше прав, чем нужно для read-only проверок. | Исправлено: добавлен workflow-level `permissions: contents: read`. Проверено: `pnpm exec prettier --check .github/workflows/ci.yml`. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-003` | `P2` | `apps/api/prisma/seed.ts` | Seed создавал dev-admin/demo с паролями прямо из кода и печатал эти пароли в консоль. При случайном запуске не в локальном окружении это могло оставить известные учётки и секреты в логах. | Исправлено: seed требует `SEED_ADMIN_PASSWORD` и `SEED_DEMO_PASSWORD` из env, проверяет минимум 12 символов и placeholder-значения, в stdout пишет только источник пароля. Проверено: seed прошёл с временными env-паролями. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-004` | `P1` | `apps/api/prisma/scripts/promote-first-admin.ts` | Скрипт первого админа по умолчанию был write-mode и мог удалить всех пользователей/компании кроме владельца, если его запустить по инструкции без dry-run. | Исправлено: по умолчанию скрипт теперь dry-run, запись требует `PROMOTE_FIRST_ADMIN_WRITE=1`. Проверено: запуск без флага нашёл owner и показал план без записи, в БД осталось 2 пользователя. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-005` | `P2` | `apps/api/src/auth/auth.controller.ts` | Logout/revoke/logout-all отзывали серверную сессию, но могли не удалить старую HttpOnly refresh-cookie в браузере: cookie выдавалась с `Path=/api/auth`, а очищалась без path. Для пользователя это выглядело бы как «вышел, но браузер всё ещё хранит старую cookie». | Исправлено: выдача и очистка refresh-cookie используют общий набор options с `Path=/api/auth`; integration-тест проверяет `Set-Cookie` при login и logout. Проверено: `pnpm --filter @ecoplatform/api exec vitest run -c vitest.integration.config.ts src/app.integration.test.ts --testNamePattern Auth` -> 20 auth tests passed. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-006` | `P1` | `apps/api/src/admin/users/admin-users.service.ts` | Защищённый первый администратор (`PLATFORM_OWNER_EMAIL`) был защищён в staff endpoint, но не в `/api/admin/users/:id/platform-roles`. Второй admin мог снять с owner роль admin или деактивировать его через другой admin-экран. | Исправлено: `AdminUsersService.updatePlatformRoles()` проверяет owner-email перед снятием admin/деактивацией; integration-тест создаёт второго admin и получает 400 при попытке снять admin у owner. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-007` | `P1` | `apps/api/src/admin/staff/admin-staff.service.ts` | `POST /api/admin/staff` создавал пользователя через Prisma `include`, поэтому ответ admin API мог содержать `passwordHash`. Даже для admin-роута хэш пароля нельзя отдавать наружу. | Исправлено: createStaff возвращает только allow-list полей через `select`, тест проверяет `passwordHash === undefined`. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-008` | `P2` | `apps/api/src/admin/staff/admin-staff.controller.ts` | `GET /api/admin/staff?limit=abc` обходил общую zod-валидацию, превращался в `NaN` и мог падать уже внутри Prisma вместо понятного 400. | Исправлено: staff list query переведён на `adminStaffListQuerySchema` и `resolvePagination`; integration-тест проверяет 400 на нечисловой `limit`. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-009` | `P1` | `packages/shared/src/dto.ts` | Ручная активация подписки принимала дату окончания в прошлом. Админ мог случайно сделать компанию `active`, хотя доступ уже должен быть истёкшим; это риск для биллинга и прав доступа. | Исправлено: `manualSubscriptionDtoSchema.endsAt` теперь требует дату в будущем; integration-тест проверяет 400, отсутствие `Subscription` и сохранение статуса `demo`. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-010` | `P2` | `apps/api/src/billing/billing.controller.ts` | `GET /api/admin/billing/companies?limit=abc` обходил zod-валидацию, мог превращать limit в `NaN` и падать внутри Prisma вместо понятного 400. | Исправлено: добавлен `adminBillingCompaniesQuerySchema`, controller валидирует query, service использует общий `resolvePagination`; integration-тест проверяет 400 на нечисловой `limit` и рабочий paginated envelope. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-011` | `P1` | `apps/api/src/content/services/news.service.ts` | `POST /api/news/:id/comments` мог создать `Discussion` и комментарий для черновой или несуществующей новости, потому что `Discussion.targetId` не имеет FK на `NewsPost`. Также reply можно было отправить с `parentCommentId` из другой новости. Это риск мусорных данных и чужих reply-цепочек. | Исправлено: перед созданием комментария сервис проверяет существующую опубликованную новость; parent-комментарий должен быть опубликованным комментарием той же `Discussion(news_post, id)`. Integration-тест проверяет черновик, missing news, foreign parent и missing parent без создания Discussion. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-012` | `P2` | `apps/api/src/content/content.controller.ts` | Content-листинги вручную делали `Number(limit)`. `limit=abc` превращался в `NaN`, а общий pagination helper молча подставлял дефолт. Пользователь или админ получал 200 вместо понятного 400, как уже было исправлено в admin/billing API. | Исправлено: добавлены zod query-схемы для public/admin content list endpoints, `news/tags` и `knowledge-base depth`; integration-тест проверяет 400 на нечисловом `limit/depth` для 10 content endpoints. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-013` | `P2` | `apps/api/src/content/services/indices.service.ts` | Добавление значения индекса цены не проверяло существование индекса заранее и не писало admin audit-log. Ошибка по несуществующему id могла уходить как Prisma/FK failure, а изменение цены оставалось без журналируемого следа. | Исправлено: `addPriceValue()` проверяет `PriceIndex`, отдаёт 404, пишет `indices.value.create/update` с before/after price; integration-тест проверяет missing index, create/update и audit log. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-014` | `P1` | `apps/api/src/files/files.service.ts` | Metadata-only endpoint мог создать публичную запись файла с SVG/HTML/любой MIME-строкой и произвольным storage key без проверки реального upload-контура. Через CMS это могло превратиться в небезопасную или битую публичную ссылку и обход дневной квоты. | Исправлено: metadata-only путь нормализует MIME, блокирует опасные MIME/расширения, применяет лимит 100 МБ, дневную квоту и общий безопасный `storageKey`; unit и integration-тесты проверяют SVG reject и PDF alias normalization. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-015` | `P1` | `apps/api/src/files/files.controller.ts` | Content-manager мог удалить любой неиспользуемый файл по id, даже если файл загрузил другой сотрудник. В CMS это риск потери чужого чернового ассета до публикации. | Исправлено: `DELETE /api/files/:id` передаёт текущего пользователя в service; удалить чужой файл может только admin, content-manager получает 403. Unit и integration-тесты проверяют запрет и сохранение записи. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-016` | `P1` | `apps/api/src/legal` | Публичный route конкретной версии юр-документа мог отдать неопубликованный черновик, если известны type/version. Некорректный type в path давал 500, а некорректный `types` query мог молча превратиться в выдачу всех активных документов. Это риск публикации незавершённого юридического текста и непредсказуемого API-поведения. | Исправлено: detail-route отдаёт только документы с `publishedAt`, неизвестный type в path/query возвращает 400; integration-тест проверяет invalid path type, invalid query filter и 404 для черновика. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-017` | `P2` | `apps/api/src/moderation/moderation.controller.ts` | `GET /api/admin/moderation/cases?limit=abc` обходил zod-валидацию, превращался в `NaN` и молча возвращал дефолтную pagination вместо понятного 400. | Исправлено: добавлен `moderationCaseListQuerySchema`, controller валидирует query через `parseBody`; integration-тест проверяет 400. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-018` | `P1` | `apps/api/src/moderation/moderation.service.ts` | `user_block`/`company_block` через модерацию отзывали сессии в БД, но не чистили Redis session-cache. При включённом Redis старый access-token мог продолжить работать до TTL кеша. | Исправлено: `ModerationService` инвалидирует user/company session-cache после применения и снятия block-санкций; модуль импортирует `RedisModule`. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-019` | `P1` | `apps/api/src/moderation/moderation.service.ts` | Admin-санкция `user_block` могла заблокировать самого администратора или защищённый первый admin-аккаунт, если он был автором модерируемого материала. Это обходило owner-защиту из admin users/staff API. | Исправлено: `user_block` запрещает self-block, `PLATFORM_OWNER_EMAIL` и уже заблокированного пользователя; integration-тест проверяет owner-case через второго admin. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-020` | `P1` | `apps/api/src/moderation/moderation.service.ts` | Снятие `company_block` всегда переводило компанию в `active`, даже если до санкции она была `demo/past_due/suspended`, а снятие одного block могло активировать цель при другой активной block-санкции. | Исправлено: block-санкция сохраняет `previousStatus`, lift восстанавливает прежний статус только если нет другого активного block; integration-тест проверяет возврат компании в `demo`. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-021` | `P2` | `apps/api/src/moderation/moderation.schemas.ts` | При снятии санкции `reasonCode=other` не требовал комментарий, в отличие от жалоб, решений и admin-санкций. Журнал мог получить неясную причину пересмотра. | Исправлено: `sanctionLiftInputSchema` теперь требует `comment` для `reasonCode=other`. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-022` | `P2` | `apps/api/src/notifications/notifications.controller.ts` | `GET /api/notifications?limit=abc` превращал `limit` в `NaN`, а service молча подставлял дефолт. Клиент получал 200 вместо понятного 400, как в ранее исправленных admin/content list endpoints. | Исправлено: list query валидируется через zod-схему; integration-тест проверяет 400 на нечисловой `limit`. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-023` | `P1` | `apps/api/src/notifications/notifications.service.ts` | `/api/notifications`, read и archive возвращали полный Prisma-row: внутренний `payload`, `domainEventId`, `sourceId`, `deliveryId`, `userId`, а preferences endpoints — `id/userId/updatedAt`. В payload уже есть IP/User-Agent login-событий и внутренние ids модерации/поддержки, поэтому публичный API отдавал лишние приватные детали. | Исправлено: публичные notifications responses используют allow-list `select`, preferences сериализуются до двух списков категорий; integration-тест проверяет отсутствие внутренних полей. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-024` | `P2` | `apps/api/src/notifications/notifications.service.ts` | Если пользователь отключал in-app для категории, `createInApp()` возвращал `null` до создания email-delivery. При будущем email-воркере пользователь мог не получить email, хотя отключал только in-app канал. | Исправлено: in-app mute пропускает только `InAppNotification`, но не мешает отдельной email-delivery очереди, если email для категории включён; unit-тест проверяет email-only delivery. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-025` | `P1` | `apps/api/src/common/sentry.ts`, `apps/web/sentry.shared.ts` | Sentry privacy-фильтр чистил email/phone/address/bank/inn-поля в object payload, но URL query и строковые сообщения закрывали только token/password/session/email. Если 5xx упал на URL вроде `?inn=...&bankAccount=...` или с сообщением `phone=...`, эти персональные данные могли уйти во внешний Sentry. | Исправлено: URL query и key=value строки теперь используют общий список чувствительных ключей; API/web unit-тесты проверяют `phone`, `inn`, `bankAccount` в URL и сообщениях. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-026` | `P1` | `apps/api/src/redis/redis.service.ts` | Если Redis-команда падала во время инвалидации сессии, сервис возвращал fallback, но мог уже на следующем запросе снова читать Redis. Старый access-token мог пройти по stale session-cache до TTL 60 секунд. | Исправлено: после любой Redis-ошибки сервис временно отключает чтение Redis и переводит auth/throttler в fallback на 60 секунд; unit-тест проверяет, что `getClient()` возвращает `null` до истечения grace-window. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-027` | `P1` | `apps/api/src/scheduler/scheduler.service.ts` | Ночной cleanup удаляемых аккаунтов сначала выбирал кандидатов, а потом удалял файлы и пользователя по сохранённым id. Если пользователь успевал отменить удаление параллельно с cron, cleanup мог удалить уже отменённый аккаунт или его file metadata. | Исправлено: выборка кандидатов идёт внутри транзакции через параметризованный `SELECT ... FOR UPDATE`, поэтому отмена удаления и cron больше не могут незаметно разъехаться. Unit-тест проверяет row-lock, integration cleanup/billing сценарии прошли на тестовой БД. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-028` | `P1` | `apps/api/src/support/support.service.ts` | В модели support-сообщений есть флаг `isInternal`, но пользовательский список тикетов отдавал все сообщения тикета. Если support-команда добавит внутренние заметки, клиент компании смог бы увидеть служебный текст и ids сообщений. | Исправлено: пользовательские выдачи и ответ клиента фильтруют `messages.where.isInternal=false` и используют allow-list `select` без `authorId/ticketId`; admin-выдача сохраняет полный support-thread. Unit и integration-тесты проверяют, что внутренняя заметка не видна компании, но видна admin. | `closed` | Закрыто коммитом этого исправления. |
| `F-20260528-029` | `P2` | `apps/api/src/support/support.controller.ts`, `packages/shared/src/dto.ts` | `GET /support/tickets?limit=abc` и admin-аналог вручную парсили query и могли передать `NaN` в Prisma вместо понятного 400. Также тема/ответ из пробелов проходили минимальную длину как обычный текст. | Исправлено: support list query валидируется через zod + `resolvePagination`, тема/сообщение trim'ятся и ограничены по длине, пустой после trim текст даёт 400. Integration-тест проверяет bad query, пустую тему и пустой ответ. | `closed` | Закрыто коммитом этого исправления. |

Шаблон новой строки:

| Finding ID | Priority | Area | Risk in plain words | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `F-YYYYMMDD-001` | `P1` | `apps/api/src/...` | Что может сломаться для пользователя или данных | Команда, тест, файл, маршрут или скриншот | `open` | Исправить отдельным коммитом |

## Очередь исправлений

Очередь заполняется только после появления находок в реестре. Порядок:

1. Все `P0` по безопасности, данным, входу, оплате, админке.
2. Все `P1`, которые ломают пользовательские или админские сценарии.
3. `P2` по поддерживаемости, UX, тестам, производительности.
4. `P3` только если не мешает MVP и не раздувает коммит.

| Queue | Finding ID | Commit scope | Verification required | Status |
| --- | --- | --- | --- | --- |
| 1 | `F-20260528-001` | `chore(root): выровнять локальный Postgres с PostgreSQL 18` | `docker compose config`; `docker compose up -d postgres`; `pnpm --filter @ecoplatform/api prisma:generate`; `pnpm --filter @ecoplatform/api test:integration` | `closed` |
| 2 | `F-20260528-002` | `ci(github): ограничить права workflow-токена` | `pnpm exec prettier --check .github/workflows/ci.yml`; `pnpm lint`; `git diff --check` | `closed` |
| 3 | `F-20260528-003` | `fix(prisma): убрать хардкод seed-паролей` | `prisma validate`; `prisma:migrate`; `seed`; `pnpm --filter @ecoplatform/api lint`; `prettier --check`; `git diff --check` | `closed` |
| 4 | `F-20260528-004` | `fix(prisma): включить dry-run для первого админа` | `promote-first-admin.ts` без `PROMOTE_FIRST_ADMIN_WRITE`; `postgres-local` user count; `pnpm --filter @ecoplatform/api lint`; `prettier --check`; `git diff --check` | `closed` |
| 5 | `F-20260528-005` | `fix(auth): корректно очищать refresh-cookie` | `pnpm --filter @ecoplatform/api test -- auth`; `pnpm --filter @ecoplatform/api exec vitest run -c vitest.integration.config.ts src/app.integration.test.ts --testNamePattern Auth`; `pnpm --filter @ecoplatform/api lint`; `prettier --check`; `git diff --check` | `closed` |
| 6 | `F-20260528-006` | `fix(admin): защитить owner-аккаунт в users API` | `pnpm --filter @ecoplatform/api exec vitest run -c vitest.integration.config.ts --testNamePattern "Admin users panel"`; `pnpm --filter @ecoplatform/api test -- admin`; `pnpm --filter @ecoplatform/api lint`; `prettier --check`; `git diff --check` | `closed` |
| 7 | `F-20260528-007` | `fix(admin): не отдавать passwordHash при создании staff` | `pnpm --filter @ecoplatform/api exec vitest run -c vitest.integration.config.ts --testNamePattern "Admin staff panel"`; `pnpm --filter @ecoplatform/api test -- admin`; `pnpm --filter @ecoplatform/api lint`; `prettier --check`; `git diff --check` | `closed` |
| 8 | `F-20260528-008` | `fix(admin): валидировать query списка staff` | `pnpm --filter @ecoplatform/api exec vitest run -c vitest.integration.config.ts --testNamePattern "Admin staff panel"`; `pnpm --filter @ecoplatform/api test -- admin`; `pnpm --filter @ecoplatform/api lint`; `prettier --check`; `git diff --check` | `closed` |
| 9 | `F-20260528-009` | `fix(billing): закрыть риски проверки billing-api` | `pnpm --filter @ecoplatform/shared build`; `pnpm --filter @ecoplatform/api exec vitest run -c vitest.integration.config.ts --testNamePattern "Demo gating\\|Billing notifications\\|Company profile"`; `pnpm lint`; `pnpm test`; `pnpm build`; `pnpm format:check`; `git diff --check` | `closed` |
| 10 | `F-20260528-010` | `fix(billing): закрыть риски проверки billing-api` | `pnpm --filter @ecoplatform/shared build`; `pnpm --filter @ecoplatform/api exec vitest run -c vitest.integration.config.ts --testNamePattern "Demo gating\\|Billing notifications\\|Company profile"`; `pnpm lint`; `pnpm test`; `pnpm build`; `pnpm format:check`; `git diff --check` | `closed` |
| 11 | `F-20260528-011` | `fix(content): закрыть риски проверки content-api` | `pnpm --filter @ecoplatform/api test:integration -- --testNamePattern "Content publish\\|Content lifecycle: price indices\\|Discussion\\|Wave 8.4 pagination contracts"`; `pnpm lint`; `pnpm test`; `pnpm build`; `pnpm format:check`; `git diff --check` | `closed` |
| 12 | `F-20260528-012` | `fix(content): закрыть риски проверки content-api` | `pnpm --filter @ecoplatform/api test:integration -- --testNamePattern "Content publish\\|Content lifecycle: price indices\\|Discussion\\|Wave 8.4 pagination contracts"`; `pnpm lint`; `pnpm test`; `pnpm build`; `pnpm format:check`; `git diff --check` | `closed` |
| 13 | `F-20260528-013` | `fix(content): закрыть риски проверки content-api` | `pnpm --filter @ecoplatform/api test:integration -- --testNamePattern "Content publish\\|Content lifecycle: price indices\\|Discussion\\|Wave 8.4 pagination contracts"`; `pnpm lint`; `pnpm test`; `pnpm build`; `pnpm format:check`; `git diff --check` | `closed` |
| 14 | `F-20260528-014` | `fix(files): закрыть риски проверки files-api` | `pnpm --filter @ecoplatform/api test -- files`; `pnpm --filter @ecoplatform/api test:integration -- --testNamePattern "Files API"`; `pnpm lint`; `pnpm test`; `pnpm build`; `pnpm format:check`; `git diff --check` | `closed` |
| 15 | `F-20260528-015` | `fix(files): закрыть риски проверки files-api` | `pnpm --filter @ecoplatform/api test -- files`; `pnpm --filter @ecoplatform/api test:integration -- --testNamePattern "Files API"`; `pnpm lint`; `pnpm test`; `pnpm build`; `pnpm format:check`; `git diff --check` | `closed` |
| 16 | `F-20260528-016` | `fix(legal): закрыть риски проверки legal-api` | `pnpm --filter @ecoplatform/api test:integration -- --testNamePattern "Legal documents & consents"`; `pnpm lint`; `pnpm test`; `pnpm build`; `pnpm format:check`; `git diff --check` | `closed` |
| 17 | `F-20260528-017` | `fix(moderation): закрыть риски проверки moderation-api` | `pnpm --filter @ecoplatform/api lint`; `pnpm --filter @ecoplatform/api test -- moderation`; `pnpm --filter @ecoplatform/api test:integration -- --testNamePattern "Moderation\\|Admin sanctions\\|Wave 8.4 pagination contracts"`; `pnpm lint`; `pnpm test`; `pnpm build`; `pnpm format:check`; `git diff --check` | `closed` |
| 18 | `F-20260528-018` | `fix(moderation): закрыть риски проверки moderation-api` | `pnpm --filter @ecoplatform/api lint`; `pnpm --filter @ecoplatform/api test -- moderation`; `pnpm --filter @ecoplatform/api test:integration -- --testNamePattern "Moderation\\|Admin sanctions\\|Wave 8.4 pagination contracts"`; `pnpm lint`; `pnpm test`; `pnpm build`; `pnpm format:check`; `git diff --check` | `closed` |
| 19 | `F-20260528-019` | `fix(moderation): закрыть риски проверки moderation-api` | `pnpm --filter @ecoplatform/api lint`; `pnpm --filter @ecoplatform/api test -- moderation`; `pnpm --filter @ecoplatform/api test:integration -- --testNamePattern "Moderation\\|Admin sanctions\\|Wave 8.4 pagination contracts"`; `pnpm lint`; `pnpm test`; `pnpm build`; `pnpm format:check`; `git diff --check` | `closed` |
| 20 | `F-20260528-020` | `fix(moderation): закрыть риски проверки moderation-api` | `pnpm --filter @ecoplatform/api lint`; `pnpm --filter @ecoplatform/api test -- moderation`; `pnpm --filter @ecoplatform/api test:integration -- --testNamePattern "Moderation\\|Admin sanctions\\|Wave 8.4 pagination contracts"`; `pnpm lint`; `pnpm test`; `pnpm build`; `pnpm format:check`; `git diff --check` | `closed` |
| 21 | `F-20260528-021` | `fix(moderation): закрыть риски проверки moderation-api` | `pnpm --filter @ecoplatform/api lint`; `pnpm --filter @ecoplatform/api test -- moderation`; `pnpm --filter @ecoplatform/api test:integration -- --testNamePattern "Moderation\\|Admin sanctions\\|Wave 8.4 pagination contracts"`; `pnpm lint`; `pnpm test`; `pnpm build`; `pnpm format:check`; `git diff --check` | `closed` |
| 22 | `F-20260528-022` | `fix(notifications): закрыть риски проверки notifications-api` | `pnpm --filter @ecoplatform/api test -- notifications`; `pnpm --filter @ecoplatform/api test:integration -- --testNamePattern "notifications\\|Email channel queue"`; `pnpm lint`; `pnpm test`; `pnpm build`; `pnpm test:integration`; `pnpm format:check`; `git diff --check` | `closed` |
| 23 | `F-20260528-023` | `fix(notifications): закрыть риски проверки notifications-api` | `pnpm --filter @ecoplatform/api test -- notifications`; `pnpm --filter @ecoplatform/api test:integration -- --testNamePattern "notifications\\|Email channel queue"`; `pnpm lint`; `pnpm test`; `pnpm build`; `pnpm test:integration`; `pnpm format:check`; `git diff --check` | `closed` |
| 24 | `F-20260528-024` | `fix(notifications): закрыть риски проверки notifications-api` | `pnpm --filter @ecoplatform/api test -- notifications`; `pnpm --filter @ecoplatform/api test:integration -- --testNamePattern "notifications\\|Email channel queue"`; `pnpm lint`; `pnpm test`; `pnpm build`; `pnpm test:integration`; `pnpm format:check`; `git diff --check` | `closed` |
| 25 | `F-20260528-025` | `fix(observability): закрыть риски проверки observability` | `pnpm --filter @ecoplatform/api test -- sentry`; `pnpm --filter @ecoplatform/web test -- sentry`; `pnpm --filter @ecoplatform/api test:integration -- --testNamePattern "Prometheus\\|metrics"`; `pnpm lint`; `pnpm test`; `pnpm build`; `pnpm test:integration`; `pnpm format:check`; `git diff --check` | `closed` |
| 26 | `F-20260528-026` | `fix(redis): закрыть риски проверки redis-cache` | `pnpm --filter @ecoplatform/api exec vitest run src/redis/redis.service.test.ts src/redis/session-cache.service.test.ts src/redis/redis-throttler-storage.service.test.ts src/common/jwt-auth.guard.test.ts`; `pnpm --filter @ecoplatform/api exec tsc --noEmit --pretty false`; `pnpm lint`; `pnpm test`; `pnpm build`; `pnpm test:integration`; `pnpm format:check`; `git diff --check` | `closed` |
| 27 | `F-20260528-027` | `fix(scheduler): закрыть риски проверки scheduler` | `pnpm --filter @ecoplatform/api test -- scheduler`; `pnpm --filter @ecoplatform/api test:integration -- --testNamePattern "cleanup-deleted-accounts\\|Billing notifications"`; `pnpm lint`; `pnpm test`; `pnpm build`; `pnpm format:check`; `git diff --check` | `closed` |
| 28 | `F-20260528-028` | `fix(support): закрыть риски проверки support-api` | `pnpm --filter @ecoplatform/shared build`; `pnpm --filter @ecoplatform/api test -- support`; `pnpm --filter @ecoplatform/api exec tsc --noEmit --pretty false`; `pnpm --filter @ecoplatform/api test:integration -- --testNamePattern "Support ownership"`; `pnpm lint`; `pnpm test`; `pnpm build`; `pnpm format:check`; `git diff --check` | `closed` |
| 29 | `F-20260528-029` | `fix(support): закрыть риски проверки support-api` | `pnpm --filter @ecoplatform/shared build`; `pnpm --filter @ecoplatform/api test -- support`; `pnpm --filter @ecoplatform/api exec tsc --noEmit --pretty false`; `pnpm --filter @ecoplatform/api test:integration -- --testNamePattern "Support ownership"`; `pnpm lint`; `pnpm test`; `pnpm build`; `pnpm format:check`; `git diff --check` | `closed` |

## Базовые проверки

Для roadmap-only изменений:

```bash
pnpm format:check
git diff --check
```

Для code-heavy исправлений:

```bash
pnpm lint
pnpm test
pnpm build
pnpm test:integration
pnpm format:check
```

Для UI-исправлений дополнительно нужен browser-check реального маршрута:

- desktop viewport;
- mobile viewport;
- ключевой пользовательский сценарий;
- отсутствие очевидного overflow и перекрытия текста;
- скриншот как доказательство.

## Мини-промт для продолжения

```text
Продолжи полномасштабный аудит ЭкоПлатформы из /Users/mojosay/createspace/ecoplatform.
Сначала прочитай CODEBASE_AUDIT_ROADMAP.md, PROJECT_STATUS.md, README.md,
git status --short и git log --oneline -5. Возьми первый модуль со статусом
not_started в матрице, проверь только его, обнови roadmap с доказательствами.
Один пункт проверки или один баг — один коммит.
```
