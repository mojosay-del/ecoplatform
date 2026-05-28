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
| A-ROOT | Root config | `findings` | A | package scripts, turbo tasks, workspace, tsconfig, docker compose |
| A-CI | `.github/workflows` | `not_started` | A/E | static checks, integration DB, smoke trigger, secrets boundary |
| A-OPS | `ops/monitoring` | `not_started` | A/E | alerts, example config, absence of real secrets |
| B-PRISMA | `apps/api/prisma` | `not_started` | B | schema, migrations, indexes, constraints, seed safety |
| B-AUTH | `apps/api/src/auth` | `not_started` | B | login, refresh, lockout, export data, deletion, password policy |
| B-COMMON | `apps/api/src/common` | `not_started` | B | guards, roles, CSRF, pagination, logging filters, sanitizing |
| B-ADMIN | `apps/api/src/admin` | `not_started` | B | RBAC, audit log, dashboard queries, admin mutations |
| B-BILLING | `apps/api/src/billing` | `not_started` | B | company profile, subscriptions, manual activation, notifications |
| B-CONTENT | `apps/api/src/content` | `not_started` | B | CMS validation, publish/preview rules, tags, indices, block payloads |
| B-FILES | `apps/api/src/files` | `not_started` | B | MIME/extension/size checks, S3 paths, public/private access |
| B-LEGAL | `apps/api/src/legal` | `not_started` | B | active documents, consent records, re-consent flow |
| B-MOD | `apps/api/src/moderation` | `not_started` | B | sanctions, report flow, module restrictions, edge cases |
| B-NOTIF | `apps/api/src/notifications` | `not_started` | B | in-app delivery, read states, privacy of notification payloads |
| B-OBS | `apps/api/src/observability` | `not_started` | E | metrics auth, labels, cardinality, Sentry/log filtering |
| B-REDIS | `apps/api/src/redis` | `not_started` | B/E | session cache invalidation, throttler fallback |
| B-SCHED | `apps/api/src/scheduler` | `not_started` | B/E | advisory locks, cleanup safety, billing cron idempotency |
| B-SUPPORT | `apps/api/src/support` | `not_started` | B | ticket ownership, admin access, status transitions |
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

Статус: `findings`.

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
- найдено окруженческое расхождение `F-20260528-001`: локальный Postgres в
  Docker Compose отстаёт от CI/prod версии.

## Реестр находок

Новые строки добавляются только после проверки конкретного кода или сценария.

| Finding ID | Priority | Area | Risk in plain words | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `F-20260528-001` | `P2` | `docker-compose.yml` | Локальная разработка и integration-тесты могут идти на PostgreSQL 16, а CI и целевой деплой — на PostgreSQL 18. Из-за этого часть SQL/Prisma-проблем может проявиться только в CI или prod-like среде. | `docker-compose.yml:3` = `postgres:16`; `.github/workflows/ci.yml:56` = `postgres:18-alpine`; `README.md:98` и `README.md:109` фиксируют CI/target PostgreSQL 18. | `open` | Отдельным коммитом выровнять локальный Docker Compose под PostgreSQL 18 и проверить запуск Postgres + Prisma/integration path. |

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
| 1 | `F-20260528-001` | `chore(root): выровнять локальный Postgres с PostgreSQL 18` | `docker compose config`; `docker compose up -d postgres`; `pnpm --filter @ecoplatform/api prisma:generate`; `pnpm --filter @ecoplatform/api test:integration` | `open` |

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
